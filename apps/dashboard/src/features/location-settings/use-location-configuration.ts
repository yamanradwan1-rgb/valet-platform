"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  ConfigurationSettingKey,
} from "@valet/contracts";

import { useAuth } from "../auth/use-auth";
import { useDashboardLocation } from "../location/location-context";
import {
  clearConfigurationOverride,
  fetchLocationConfiguration,
  setConfigurationOverride,
} from "./configuration-api";
import {
  createConfigurationController,
  type ConfigurationController,
  type ConfigurationSnapshot,
} from "./configuration-controller";

/**
 * React binding for the /location-settings surface.
 *
 * The controller owns every subtle rule (token capture/advance, conflict
 * posture, cross-location discards); this hook only:
 * - creates ONE controller per mounted page (lazy state initializer, so no
 *   ref is ever read during render);
 * - feeds it the currently selected AUTHORIZED location from LocationContext
 *   (A→B switches go through controller.load, which discards A's state);
 * - mirrors snapshots into React state.
 */

function initialSnapshot(): ConfigurationSnapshot {
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

export interface UseLocationConfigurationResult {
  readonly snapshot: ConfigurationSnapshot;
  readonly locationId: string;
  reload: () => void;
  dismissMutationError: () => void;
  setOverride: (input: {
    setting: ConfigurationSettingKey;
    value: boolean | number | string;
  }) => void;
  clearOverride: (setting: ConfigurationSettingKey) => void;
}

export function useLocationConfiguration(): UseLocationConfigurationResult {
  const { client } = useAuth();
  const location = useDashboardLocation();
  const locationId = location?.locationId ?? "";

  const [snapshot, setSnapshot] = useState<ConfigurationSnapshot>(
    initialSnapshot,
  );

  // One controller per mounted page. The authenticated StaffApiClient
  // instance is stable for the lifetime of the shell, so capturing it here
  // cannot go stale.
  const [controller] = useState<ConfigurationController>(() =>
    createConfigurationController({
      clearOverride: ({ locationId: target, request }) =>
        clearConfigurationOverride(client, target, request),
      fetcher: ({ locationId: target, signal }) =>
        fetchLocationConfiguration(client, target, signal),
      onChange: setSnapshot,
      setOverride: ({ locationId: target, request }) =>
        setConfigurationOverride(client, target, request),
    }),
  );

  useEffect(() => {
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
