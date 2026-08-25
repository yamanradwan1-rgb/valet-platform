"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateLocationMapAreaRequest,
  CreateLocationMapPointRequest,
  LocationMapArea,
  LocationMapPoint,
  ReplaceLocationMapAreaVerticesRequest,
  UpdateLocationMapAreaRequest,
  UpdateLocationMapPointRequest,
} from "@valet/contracts";

import {
  createMapArea,
  createMapPoint,
  fetchMapAreas,
  fetchMapPoints,
  loadMapSetup,
  replaceMapAreaVertices,
  updateMapArea,
  updateMapPoint,
  type MapSetupClient,
  type MapSetupData,
} from "./map-setup-api";
import {
  beginMutation,
  mergeMutationIntoSettled,
  normalizeFailure,
  selectSetupLoadState,
  unwrapArea,
  unwrapPoint,
  type MutationResult,
  type SettledLoad,
  type SetupLoadState,
} from "./map-setup-state";

export type { MapSetupData };

/**
 * Load + mutation lifecycle for the /maps-zones surface.
 *
 * Race safety: settled loads are stamped with attempt AND locationId and may
 * only render while both still match (selectSetupLoadState); mutations capture
 * their locationId at call time, so an entity returned after a location switch
 * is discarded instead of merging into the new location's data. Duplicate
 * submissions are blocked through a single pending-operation slot. Successful
 * mutations upsert the backend response immediately, then trigger a silent
 * full refetch so ordering truth comes from the backend again.
 */
export interface UseMapSetupResult {
  readonly state: SetupLoadState;
  readonly pendingOperation: string | null;
  /** True when an authoritative post-mutation refetch failed (non-blocking). */
  readonly refreshFailed: boolean;
  reload: () => void;
  dismissRefreshFailure: () => void;
  createPoint: (
    request: CreateLocationMapPointRequest,
  ) => Promise<LocationMapPoint>;
  updatePoint: (
    pointId: string,
    patch: UpdateLocationMapPointRequest,
  ) => Promise<LocationMapPoint>;
  createArea: (
    request: CreateLocationMapAreaRequest,
  ) => Promise<LocationMapArea>;
  updateArea: (
    areaId: string,
    patch: UpdateLocationMapAreaRequest,
  ) => Promise<LocationMapArea>;
  replaceVertices: (
    areaId: string,
    request: ReplaceLocationMapAreaVerticesRequest,
  ) => Promise<LocationMapArea>;
}

const ABORT_ERROR_NAME = "AbortError";

export function useMapSetup(
  client: MapSetupClient,
  locationId: string,
): UseMapSetupResult {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<SettledLoad | null>(null);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  /** Location whose post-mutation refresh last failed; null when healthy. */
  const [refreshFailedFor, setRefreshFailedFor] = useState<string | null>(null);

  const pendingRef = useRef<string | null>(null);
  const locationRef = useRef(locationId);

  useEffect(() => {
    locationRef.current = locationId;
  }, [locationId]);

  useEffect(() => {
    // An unset location requests nothing; any previously settled data stays
    // invisible because selectSetupLoadState collapses identity mismatches
    // back to `loading`.
    if (locationId.length === 0) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    void loadMapSetup(client, locationId, controller.signal)
      .then((loaded) => {
        if (cancelled) return;
        setSettled({
          attempt,
          locationId,
          outcome: { data: loaded, phase: "ready" },
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof Error && error.name === ABORT_ERROR_NAME) return;
        setSettled({
          attempt,
          locationId,
          outcome: { error: normalizeFailure(error), phase: "error" },
        });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt, client, locationId]);

  // Authoritative reconciliation after successful mutations: silently refetch
  // both collections without flipping the surface into a full loading state.
  // Failures surface as a non-blocking notice with retry.
  useEffect(() => {
    if (refreshNonce === 0 || locationId.length === 0) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const [points, areas] = await Promise.all([
          fetchMapPoints(client, locationId, controller.signal),
          fetchMapAreas(client, locationId, controller.signal),
        ]);
        if (cancelled || locationRef.current !== locationId) return;
        setSettled((current) =>
          current !== null &&
          current.locationId === locationId &&
          current.outcome.phase === "ready"
            ? {
                ...current,
                outcome: {
                  data: { areas, points },
                  phase: "ready",
                },
              }
            : current,
        );
        setRefreshFailedFor(null);
      } catch {
        // Stamped with the location the failed refresh belonged to, so a
        // later location switch can never show a stale cross-location banner.
        if (!cancelled) setRefreshFailedFor(locationId);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [client, locationId, refreshNonce]);

  const reload = useCallback(() => {
    setAttempt((nonce) => nonce + 1);
  }, []);

  const dismissRefreshFailure = useCallback(() => {
    setRefreshFailedFor(null);
  }, []);

  /** Upserts the authoritative entity into visible ready data (identity-guarded). */
  const mergeEntity = useCallback((result: MutationResult) => {
    const targetLocationId = locationRef.current;
    setSettled((current) =>
      mergeMutationIntoSettled(current, targetLocationId, result),
    );
  }, []);

  const startMutation = useCallback(
    (
      operation: string,
      run: (targetLocationId: string) => Promise<MutationResult>,
    ): Promise<MutationResult | undefined> => {
      if (beginMutation(pendingRef.current) !== "started") {
        return Promise.resolve(undefined);
      }
      const targetLocationId = locationRef.current;
      pendingRef.current = operation;
      setPendingOperation(operation);
      const finish = () => {
        pendingRef.current = null;
        setPendingOperation(null);
      };
      return run(targetLocationId)
        .then((result) => {
          finish();
          if (locationRef.current === targetLocationId) {
            mergeEntity(result);
            setRefreshNonce((nonce) => nonce + 1);
          }
          return result;
        })
        .catch((error: unknown) => {
          finish();
          throw error;
        });
    },
    [mergeEntity],
  );

  /** Runs a point mutation through the shared guard and unwraps its entity. */
  const runPoint = useCallback(
    (
      operation: string,
      call: (targetLocationId: string) => Promise<LocationMapPoint>,
    ): Promise<LocationMapPoint> =>
      startMutation(operation, async (loc) => ({
        entity: await call(loc),
        kind: "point",
      })).then(unwrapPoint),
    [startMutation],
  );

  /** Area counterpart of `runPoint`. */
  const runArea = useCallback(
    (
      operation: string,
      call: (targetLocationId: string) => Promise<LocationMapArea>,
    ): Promise<LocationMapArea> =>
      startMutation(operation, async (loc) => ({
        entity: await call(loc),
        kind: "area",
      })).then(unwrapArea),
    [startMutation],
  );

  const createPointAction = useCallback(
    (request: CreateLocationMapPointRequest) =>
      runPoint("point.create", (loc) => createMapPoint(client, loc, request)),
    [client, runPoint],
  );

  const updatePointAction = useCallback(
    (pointId: string, patch: UpdateLocationMapPointRequest) =>
      runPoint("point.update", (loc) =>
        updateMapPoint(client, loc, pointId, patch),
      ),
    [client, runPoint],
  );

  const createAreaAction = useCallback(
    (request: CreateLocationMapAreaRequest) =>
      runArea("area.create", (loc) => createMapArea(client, loc, request)),
    [client, runArea],
  );

  const updateAreaAction = useCallback(
    (areaId: string, patch: UpdateLocationMapAreaRequest) =>
      runArea("area.update", (loc) =>
        updateMapArea(client, loc, areaId, patch),
      ),
    [client, runArea],
  );

  const replaceVerticesAction = useCallback(
    (areaId: string, request: ReplaceLocationMapAreaVerticesRequest) =>
      runArea("area.vertices", (loc) =>
        replaceMapAreaVertices(client, loc, areaId, request),
      ),
    [client, runArea],
  );

  const state: SetupLoadState = selectSetupLoadState(
    settled,
    locationId,
    attempt,
  );

  return {
    createArea: createAreaAction,
    createPoint: createPointAction,
    dismissRefreshFailure,
    pendingOperation,
    refreshFailed: refreshFailedFor !== null && refreshFailedFor === locationId,
    reload,
    replaceVertices: replaceVerticesAction,
    state,
    updateArea: updateAreaAction,
    updatePoint: updatePointAction,
  };
}
