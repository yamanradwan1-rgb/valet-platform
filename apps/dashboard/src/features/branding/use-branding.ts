"use client";

import { useEffect, useMemo, useState } from "react";

import type { BrandingSetting } from "@valet/contracts";

import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import {
  clearBrandingOverride,
  fetchLocationBranding,
  setBrandingOverride,
} from "./branding-api";
import {
  createBrandingController,
  type BrandingController,
  type BrandingSnapshot,
} from "./branding-controller";

/**
 * React binding for the /branding surface (D4-004).
 *
 * The controller owns every subtle rule (token capture/advance, conflict
 * posture, cross-location discards); this hook only:
 * - creates ONE controller per mounted page (lazy state initializer, so no
 *   ref is ever read during render);
 * - feeds it the currently selected AUTHORIZED location from LocationContext
 *   (A→B switches go through controller.load, which discards A's state);
 * - mirrors snapshots into React state.
 */

function initialSnapshot(): BrandingSnapshot {
  return {
    conflict: null,
    data: null,
    loadError: null,
    locationId: null,
    mutationError: null,
    pendingMutation: null,
    phase: "loading",
  };
}

export interface UseBrandingResult {
  readonly snapshot: BrandingSnapshot;
  readonly locationId: string;
  reload: () => void;
  dismissMutationError: () => void;
  setOverride: (input: { setting: BrandingSetting; value: string }) => void;
  clearOverride: (setting: BrandingSetting) => void;
}

export function useBranding(): UseBrandingResult {
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? "";

  const [snapshot, setSnapshot] = useState<BrandingSnapshot>(
    initialSnapshot,
  );

  // One controller per mounted page. The authenticated StaffApiClient
  // instance is stable for the lifetime of the shell, so capturing it here
  // cannot go stale.
  const [controller] = useState<BrandingController>(() =>
    createBrandingController({
      clearOverride: ({ locationId: target, request }) =>
        clearBrandingOverride(client, target, request),
      fetcher: ({ locationId: target, signal }) =>
        fetchLocationBranding(client, target, signal),
      onChange: setSnapshot,
      setOverride: ({ locationId: target, request }) =>
        setBrandingOverride(client, target, request),
    }),
  );

  useEffect(() => {
    // locationId is empty ONLY while no authorized location is selected —
    // a state in which LocationGate renders its loader/error posture instead
    // of this page (see features/location/location-gate-render-contract.test.ts).
    // While this page is mounted the id is therefore always non-empty; the
    // early return below is pure defense for that unreachable input.
    if (locationId.length === 0) return undefined;
    controller.load(locationId);
    return undefined;
  }, [controller, locationId]);

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  return useMemo(
    () => ({
      clearOverride: (setting) => controller.clearOverride(setting),
      dismissMutationError: () => controller.dismissMutationError(),
      locationId,
      reload: () => controller.reload(),
      setOverride: (input) => controller.setOverride(input),
      snapshot,
    }),
    [controller, locationId, snapshot],
  );
}
