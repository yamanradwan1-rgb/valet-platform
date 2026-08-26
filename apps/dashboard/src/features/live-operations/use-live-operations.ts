"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { StaffApiClient } from "../../lib/api/staff-api-client";
import {
  selectScopedValue,
  stampScope,
  type ScopedValue,
} from "../../lib/api/scoped-view";
import { fetchLiveOperationsPage } from "./live-operations-api";
import {
  createLiveOperationsController,
  type LiveOperationsController,
  type LiveOperationsSnapshot,
} from "./live-operations-controller";

function initialSnapshot(): LiveOperationsSnapshot {
  return {
    items: [],
    nextCursor: null,
    phase: "loading",
    loadingMore: false,
    moreError: false,
    observedAt: null,
    refreshing: false,
    refreshFailed: false,
    error: null,
  };
}

/**
 * React binding for the Live Operations controller.
 *
 * The controller is recreated whenever `client` or `locationId` changes, so a
 * location change is a hard request-identity reset: the old instance is
 * disposed (aborting its request) before the new one loads. Nothing here
 * caches live rows outside a single location lifecycle.
 */
export function useLiveOperations(
  client: StaffApiClient,
  locationId: string | null,
): {
  readonly snapshot: LiveOperationsSnapshot;
  refresh: () => void;
  retry: () => void;
  loadMore: () => void;
} {
  const [scoped, setScoped] = useState<ScopedValue<LiveOperationsSnapshot>>(
    () => stampScope(null, initialSnapshot()),
  );
  const clientRef = useRef(client);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);
  const controllerRef = useRef<LiveOperationsController | null>(null);

  useEffect(() => {
    if (locationId === null) return;
    // Stamped from THIS effect's closure (request-time scope): a late
    // response the old controller emits stays previous-scoped and therefore
    // invisible under the new location, even inside the render-to-effect
    // window before this cleanup runs.
    const scope = locationId;
    const controller = createLiveOperationsController({
      fetcher: (params) =>
        fetchLiveOperationsPage(
          clientRef.current,
          params.locationId,
          params.cursor,
          params.signal,
        ),
      onChange: (snapshot) => setScoped(stampScope(scope, snapshot)),
    });
    controllerRef.current = controller;
    controller.load(locationId);
    return () => {
      controller.dispose();
      controllerRef.current = null;
    };
  }, [client, locationId]);

  const refresh = useCallback(() => {
    controllerRef.current?.refresh();
  }, []);

  const retry = useCallback(() => {
    controllerRef.current?.retry();
  }, []);

  const loadMore = useCallback(() => {
    controllerRef.current?.loadMore();
  }, []);

  // Render-time scope selection (D5-001): a previous-location snapshot
  // collapses to B's loading posture synchronously, before effects run.
  const snapshot = selectScopedValue(
    scoped,
    locationId,
    initialSnapshot(),
  );

  return { snapshot, refresh, retry, loadMore };
}
