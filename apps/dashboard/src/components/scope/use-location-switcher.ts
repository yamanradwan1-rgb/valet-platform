"use client";

import type { ManagementLocation } from "@valet/contracts";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  listCompanyAdminLocations,
  listLocationManagerLocations,
} from "../../lib/scope/dashboard-scope";
import {
  proveLocationSwitchCandidate,
  type LocationSwitchCandidate,
} from "./location-switch-authority";
import {
  allowsAllLocationsForPath,
  canOfferLocationForPath,
} from "./location-switch-policy";
import {
  candidateKey,
  locationSwitchRequestKey,
  organizationIdForSwitch,
  sourceSelectedLocationKey,
  type LocationSwitchMenuStatus,
  type PendingLocationSelection,
} from "./location-switch-state";
import type { LocationSwitcherInput } from "./location-switch-types";
import {
  isLocationSwitchAuthorityLoss,
  useLocationSwitchEpochGuard,
} from "./use-location-switch-epoch-guard";

export function useLocationSwitcher(input: LocationSwitcherInput) {
  const { begin, current: currentInput, guard, isCurrent, recoverCurrent } =
    useLocationSwitchEpochGuard(input);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LocationSwitchMenuStatus>("idle");
  const [locations, setLocations] = useState<readonly ManagementLocation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pendingRef = useRef<PendingLocationSelection | null>(null);
  const proofCursorRef = useRef(new Map<string, string | undefined>());
  useLayoutEffect(() => () => guard.invalidate(), [guard]);

  const discover = useCallback(
    async (cursor?: string) => {
      const ticket = begin();
      const live = currentInput();
      const organizationId = organizationIdForSwitch(live.currentScope);
      setStatus("loading");
      setSelectionError(false);
      try {
        const page =
          live.currentScope.authority === "COMPANY_ADMIN"
            ? await listCompanyAdminLocations(
                live.api,
                organizationId,
                cursor === undefined ? {} : { cursor },
                ticket.request.signal,
              )
            : await listLocationManagerLocations(
                live.api,
                organizationId,
                cursor === undefined ? {} : { cursor },
                ticket.request.signal,
              );
        if (!isCurrent(ticket)) return;
        for (const location of page.items) {
          proofCursorRef.current.set(location.locationId, cursor);
        }
        setLocations((items) =>
          cursor === undefined ? page.items : [...items, ...page.items],
        );
        setNextCursor(page.nextCursor);
        setStatus("ready");
      } catch (reason: unknown) {
        if (!isCurrent(ticket)) return;
        if (
          live.currentScope.authority === "COMPANY_ADMIN" &&
          reason instanceof DashboardApiError &&
          reason.kind === "mfa"
        ) {
          guard.invalidate();
          setOpen(false);
          setLocations([]);
          setNextCursor(null);
          live.onMfaRequired();
          return;
        }
        if (isLocationSwitchAuthorityLoss(reason)) {
          setLocations([]);
          setNextCursor(null);
          if (await recoverCurrent(ticket, "discovery-recovery")) return;
        }
        setStatus("error");
      }
    },
    [begin, currentInput, guard, isCurrent, recoverCurrent],
  );

  const toggle = useCallback(() => {
    if (open) {
      guard.invalidate();
      pendingRef.current = null;
      setOpen(false);
      setPendingKey(null);
      return;
    }
    setOpen(true);
    setLocations([]);
    setNextCursor(null);
    proofCursorRef.current.clear();
    void discover();
  }, [discover, guard, open]);

  const dismiss = useCallback(() => {
    guard.invalidate();
    pendingRef.current = null;
    setOpen(false);
    setPendingKey(null);
  }, [guard]);

  const selectCandidate = useCallback(
    async (candidate: LocationSwitchCandidate) => {
      const candidateKeyValue = candidateKey(candidate);
      if (pendingRef.current?.key === candidateKeyValue) return;
      const ticket = begin();
      const owner = {
        generation: ticket.request.generation,
        key: candidateKeyValue,
      };
      pendingRef.current = owner;
      setPendingKey(candidateKeyValue);
      setSelectionError(false);
      const live = currentInput();
      const proofCursor =
        candidate.kind === "LOCATION"
          ? proofCursorRef.current.get(candidate.location.locationId)
          : undefined;
      const effectiveCandidate =
        candidate.kind === "LOCATION" &&
        live.currentScope.authority !== "COMPANY_ADMIN" &&
        proofCursor !== undefined
          ? { ...candidate, proofCursor }
          : candidate;
      try {
        const proof = await proveLocationSwitchCandidate({
          accessRequirement: live.accessRequirement,
          api: live.api,
          candidate: effectiveCandidate,
          currentPath: live.currentPath,
          currentScope: live.currentScope,
          preserveIndependentRoute: live.preserveIndependentRoute,
          requestKey: locationSwitchRequestKey(ticket, candidateKeyValue),
          signal: ticket.request.signal,
        });
        if (!isCurrent(ticket)) return;
        if (proof.kind === "DENIED") {
          if (candidate.kind === "LOCATION") {
            setLocations((items) =>
              items.filter(
                (item) => item.locationId !== candidate.location.locationId,
              ),
            );
          }
          if (await recoverCurrent(ticket, candidateKeyValue)) return;
          setSelectionError(true);
          return;
        }
        if (pendingRef.current === owner) pendingRef.current = null;
        guard.invalidate();
        setOpen(false);
        setLocations([]);
        setNextCursor(null);
        live.onCommit(proof.scope, proof.destination, proof.navigation);
      } catch (reason: unknown) {
        if (!isCurrent(ticket)) return;
        if (
          live.currentScope.authority === "COMPANY_ADMIN" &&
          reason instanceof DashboardApiError &&
          reason.kind === "mfa"
        ) {
          guard.invalidate();
          setOpen(false);
          setLocations([]);
          setNextCursor(null);
          live.onMfaRequired();
          return;
        }
        if (
          candidate.kind === "LOCATION" &&
          isLocationSwitchAuthorityLoss(reason)
        ) {
          setLocations((items) =>
            items.filter(
              (item) => item.locationId !== candidate.location.locationId,
            ),
          );
        }
        if (
          isLocationSwitchAuthorityLoss(reason) &&
          (await recoverCurrent(ticket, candidateKeyValue))
        )
          return;
        setSelectionError(true);
      } finally {
        if (pendingRef.current === owner) {
          pendingRef.current = null;
          setPendingKey(null);
        }
      }
    },
    [begin, currentInput, guard, isCurrent, recoverCurrent],
  );

  const current = input.currentScope;
  const authority =
    current.authority === "COMPANY_ADMIN"
      ? "COMPANY_ADMIN"
      : "LOCATION_MANAGER";
  const visibleLocations = locations.filter((location) =>
    canOfferLocationForPath(
      input.currentPath,
      input.accessRequirement,
      authority,
      location,
    ),
  );
  return {
    canShowAllLocations:
      authority === "COMPANY_ADMIN" &&
      allowsAllLocationsForPath(input.currentPath, input.accessRequirement),
    dismiss,
    loadMore:
      nextCursor === null || status === "loading"
        ? null
        : () => void discover(nextCursor),
    locations: visibleLocations,
    open,
    pendingKey,
    retry: () => void discover(),
    selectCandidate: (candidate: LocationSwitchCandidate) =>
      void selectCandidate(candidate),
    selectedKey: sourceSelectedLocationKey(current),
    selectionError,
    status,
    toggle,
  };
}
