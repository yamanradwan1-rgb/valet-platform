import type {
  ClearConfigurationOverrideRequest,
  ConfigurationMutationResponse,
  ConfigurationSettingKey,
  LocationConfigurationResponse,
  SetConfigurationOverrideRequest,
} from "@valet/contracts";

import {
  applyMutationResponse,
  buildClearOverrideRequest,
  buildSetOverrideRequest,
  isConfigurationConflictError,
} from "./configuration-state";

/**
 * Framework-free Location Settings controller (D4-003). The subtle rules
 * live here, not in React.
 *
 * OPTIMISTIC CONCURRENCY:
 * - the GET response's `updatedAt` is stored verbatim as the authoritative
 *   token; every mutation captures it AT SEND TIME as `expectedUpdatedAt`
 *   (never null, never guessed, never silently refreshed);
 * - SUCCESS replaces state from the authoritative response and advances the
 *   token to the response token (the NEXT mutation uses it automatically);
 * - 409 CONFIGURATION_OVERRIDE_CONFLICT never fakes success and never
 *   auto-overwrites: intent is preserved for review, writes stay blocked,
 *   and only an explicit reload() fetches latest before a deliberate retry.
 *   A stale write is NEVER retried with a fresh token.
 *
 * LOCATION IDENTITY / RACE SAFETY:
 * - loads carry a monotonic sequence AND locationId; a late A response can
 *   never replace B state, and load() discards A's config/token/conflict;
 * - mutations capture their target location at call time; an A mutation may
 *   still succeed server-side after a switch to B, but its response is
 *   discarded unless the visible snapshot is still exactly the ready one
 *   (same location AND same token) the write was built from.
 */

export interface ConfigurationConflict {
  /** The user's attempted intent, preserved verbatim for deliberate retry. */
  readonly attemptedRequest:
    | SetConfigurationOverrideRequest
    | ClearConfigurationOverrideRequest;
}

export interface ConfigurationSnapshot {
  readonly phase: "loading" | "ready" | "error";
  readonly locationId: string | null;
  /** Authoritative envelope; carries the current updatedAt token. */
  readonly data: LocationConfigurationResponse | null;
  readonly loadError: unknown;
  readonly conflict: ConfigurationConflict | null;
  readonly pendingMutation: ConfigurationSettingKey | null;
  readonly mutationError: unknown;
}

export interface ConfigurationLoadParams {
  readonly locationId: string;
  readonly signal: AbortSignal;
}

export type ConfigurationFetcher = (
  params: ConfigurationLoadParams,
) => Promise<LocationConfigurationResponse>;

export interface ConfigurationControllerOptions {
  fetcher: ConfigurationFetcher;
  setOverride: (params: {
    locationId: string;
    request: SetConfigurationOverrideRequest;
  }) => Promise<ConfigurationMutationResponse>;
  clearOverride: (params: {
    locationId: string;
    request: ClearConfigurationOverrideRequest;
  }) => Promise<ConfigurationMutationResponse>;
  onChange: (snapshot: ConfigurationSnapshot) => void;
}

export interface ConfigurationController {
  /** Loads one location; supersedes everything prior (including conflicts). */
  load(locationId: string): void;
  /**
   * Re-fetches the CURRENT location's authoritative configuration. Used after
   * a conflict or failure; never re-sends a failed write.
   */
  reload(): void;
  setOverride(input: {
    setting: ConfigurationSettingKey;
    value: boolean | number | string;
  }): void;
  clearOverride(setting: ConfigurationSettingKey): void;
  dismissMutationError(): void;
  dispose(): void;
}

function idleSnapshot(): ConfigurationSnapshot {
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

export function createConfigurationController(
  options: ConfigurationControllerOptions,
): ConfigurationController {
  let snapshot: ConfigurationSnapshot = idleSnapshot();
  let sequence = 0;
  let activeLocationId: string | null = null;
  let inflightLoad: AbortController | null = null;
  /** Bumped whenever authoritative data is replaced (load or mutation). */
  let dataEpoch = 0;
  let disposed = false;

  const commit = (next: ConfigurationSnapshot): void => {
    snapshot = next;
    options.onChange(snapshot);
  };

  const isCurrentLoad = (seq: number, locationId: string): boolean =>
    !disposed && seq === sequence && locationId === activeLocationId;

  async function runLoad(locationId: string): Promise<void> {
    const seq = ++sequence;
    if (inflightLoad !== null) inflightLoad.abort();
    const controller = new AbortController();
    inflightLoad = controller;
    activeLocationId = locationId;
    // New request identity: prior configuration, token and conflict banner
    // are discarded with it.
    commit({ ...idleSnapshot(), locationId });
    try {
      const data = await options.fetcher({
        locationId,
        signal: controller.signal,
      });
      if (!isCurrentLoad(seq, locationId)) return;
      dataEpoch += 1;
      commit({
        ...idleSnapshot(),
        data,
        locationId,
        phase: "ready",
      });
    } catch (error: unknown) {
      if (!isCurrentLoad(seq, locationId)) return;
      if (controller.signal.aborted) return;
      commit({
        ...idleSnapshot(),
        loadError: error,
        locationId,
        phase: "error",
      });
    } finally {
      if (inflightLoad === controller) inflightLoad = null;
    }
  }

  function runMutation(
    kind: "set" | "clear",
    setting: ConfigurationSettingKey,
    value?: boolean | number | string,
  ): void {
    if (
      disposed ||
      snapshot.pendingMutation !== null ||
      // Review-first posture: while an unresolved conflict shows stale data,
      // no further write may start — reload() must bring the authoritative
      // state before ANY deliberate retry.
      snapshot.conflict !== null ||
      activeLocationId === null ||
      snapshot.locationId !== activeLocationId ||
      snapshot.phase !== "ready" ||
      snapshot.data === null
    ) {
      return;
    }
    const targetLocationId = activeLocationId;
    // The CURRENT authoritative token, captured exactly once for this write.
    const expectedUpdatedAt = snapshot.data.updatedAt;
    const request =
      kind === "set"
        ? buildSetOverrideRequest(setting, value as boolean | number | string, expectedUpdatedAt)
        : buildClearOverrideRequest(setting, expectedUpdatedAt);
    const epochAtSend = dataEpoch;
    commit({ ...snapshot, conflict: null, pendingMutation: setting });
    const promise =
      kind === "set"
        ? options.setOverride({
            locationId: targetLocationId,
            request: request as SetConfigurationOverrideRequest,
          })
        : options.clearOverride({
            locationId: targetLocationId,
            request,
          });
    void promise.then(
      (response) => {
        snapshot = { ...snapshot, pendingMutation: null };
        // Apply ONLY while the visible ready snapshot is still the exact one
        // this write was based on (same location, same token, no newer
        // authoritative replace). Otherwise the response is older news than
        // what is already on screen and is discarded.
        if (
          disposed ||
          snapshot.locationId !== targetLocationId ||
          snapshot.phase !== "ready" ||
          snapshot.data === null ||
          snapshot.data.updatedAt !== expectedUpdatedAt ||
          dataEpoch !== epochAtSend
        ) {
          return;
        }
        dataEpoch += 1;
        commit({
          ...snapshot,
          conflict: null,
          // Authoritative response payload replaces visible state:
          data: applyMutationResponse(snapshot.data, response),
          mutationError: null,
          pendingMutation: null,
        });
      },
      (error: unknown) => {
        snapshot = { ...snapshot, pendingMutation: null };
        // Late failures from another location (or against superseded state)
        // must never surface on the current location's UI.
        if (
          disposed ||
          snapshot.locationId !== targetLocationId ||
          snapshot.phase !== "ready" ||
          dataEpoch !== epochAtSend
        ) {
          return;
        }
        if (isConfigurationConflictError(error)) {
          // Honest conflict posture: no fake success, no auto-overwrite, no
          // automatic retry. The attempted intent stays available for a
          // deliberate resubmission AFTER reload().
          commit({
            ...snapshot,
            conflict: { attemptedRequest: request },
            mutationError: null,
            pendingMutation: null,
          });
          return;
        }
        commit({
          ...snapshot,
          conflict: null,
          mutationError: error,
          pendingMutation: null,
        });
      },
    );
  }

  return {
    load(locationId: string): void {
      if (!disposed) void runLoad(locationId);
    },
    reload(): void {
      if (!disposed && activeLocationId !== null) {
        void runLoad(activeLocationId);
      }
    },
    setOverride(input: {
      setting: ConfigurationSettingKey;
      value: boolean | number | string;
    }): void {
      runMutation("set", input.setting, input.value);
    },
    clearOverride(setting: ConfigurationSettingKey): void {
      runMutation("clear", setting);
    },
    dismissMutationError(): void {
      if (!disposed && snapshot.mutationError !== null) {
        commit({ ...snapshot, mutationError: null });
      }
    },
    dispose(): void {
      disposed = true;
      sequence += 1;
      if (inflightLoad !== null) {
        inflightLoad.abort();
        inflightLoad = null;
      }
    },
  };
}
