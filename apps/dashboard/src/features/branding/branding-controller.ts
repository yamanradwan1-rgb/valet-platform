import type {
  BrandingClearRequest,
  BrandingReadResponse,
  BrandingSetting,
  BrandingSetRequest,
} from "@valet/contracts";

import {
  buildClearBrandingRequest,
  buildSetBrandingRequest,
  isBrandingConflictError,
} from "./branding-state";

/**
 * Framework-free Branding controller (D4-004). The subtle rules live here,
 * not in React. Mirrors the reviewed Location Settings controller with the
 * branding-specific simplification that EVERY mutation response is the full
 * authoritative read envelope.
 *
 * OPTIMISTIC CONCURRENCY:
 * - the GET response's `updatedAt` is stored verbatim as the authoritative
 *   token; every mutation captures it AT SEND TIME as `expectedUpdatedAt`
 *   (never null, never guessed, never silently refreshed);
 * - SUCCESS replaces the visible state with the authoritative response
 *   envelope verbatim — the token advances to the response token and the
 *   NEXT mutation uses it automatically;
 * - 409 CONFIGURATION_OVERRIDE_CONFLICT never fakes success and never
 *   auto-overwrites: intent is preserved for review, writes stay blocked,
 *   and only an explicit reload() fetches latest before a deliberate retry.
 *   A stale write is NEVER retried with a fresh token.
 *
 * LOCATION IDENTITY / RACE SAFETY:
 * - loads carry a monotonic sequence AND locationId; a late A response can
 *   never replace B state, and load() discards A's branding/token/conflict;
 * - mutations capture their target location at call time; an A mutation may
 *   still succeed server-side after a switch to B, but its response is
 *   discarded unless the visible snapshot is still exactly the ready one
 *   (same location AND same token) the write was built from.
 */

export interface BrandingConflict {
  /** The user's attempted intent, preserved verbatim for deliberate retry. */
  readonly attemptedRequest: BrandingSetRequest | BrandingClearRequest;
}

export interface BrandingSnapshot {
  readonly phase: "loading" | "ready" | "error";
  readonly locationId: string | null;
  /** Authoritative envelope; carries the current updatedAt token. */
  readonly data: BrandingReadResponse | null;
  readonly loadError: unknown;
  readonly conflict: BrandingConflict | null;
  readonly pendingMutation: BrandingSetting | null;
  readonly mutationError: unknown;
}

export interface BrandingLoadParams {
  readonly locationId: string;
  readonly signal: AbortSignal;
}

export type BrandingFetcher = (
  params: BrandingLoadParams,
) => Promise<BrandingReadResponse>;

export interface BrandingControllerOptions {
  fetcher: BrandingFetcher;
  setOverride: (params: {
    locationId: string;
    request: BrandingSetRequest;
  }) => Promise<BrandingReadResponse>;
  clearOverride: (params: {
    locationId: string;
    request: BrandingClearRequest;
  }) => Promise<BrandingReadResponse>;
  onChange: (snapshot: BrandingSnapshot) => void;
}

export interface BrandingController {
  /** Loads one location; supersedes everything prior (including conflicts). */
  load(locationId: string): void;
  /**
   * Re-fetches the CURRENT location's authoritative branding. Used after a
   * conflict or failure; never re-sends a failed write.
   */
  reload(): void;
  setOverride(input: { setting: BrandingSetting; value: string }): void;
  clearOverride(setting: BrandingSetting): void;
  dismissMutationError(): void;
  dispose(): void;
}

function idleSnapshot(): BrandingSnapshot {
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

export function createBrandingController(
  options: BrandingControllerOptions,
): BrandingController {
  let snapshot: BrandingSnapshot = idleSnapshot();
  let sequence = 0;
  let activeLocationId: string | null = null;
  let inflightLoad: AbortController | null = null;
  /** Bumped whenever authoritative data is replaced (load or mutation). */
  let dataEpoch = 0;
  let disposed = false;

  const commit = (next: BrandingSnapshot): void => {
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
    // New request identity: prior branding, token and conflict banner are
    // discarded with it.
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
    setting: BrandingSetting,
    value?: string,
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
        ? buildSetBrandingRequest(setting, value as string, expectedUpdatedAt)
        : buildClearBrandingRequest(setting, expectedUpdatedAt);
    const epochAtSend = dataEpoch;
    commit({ ...snapshot, conflict: null, pendingMutation: setting });
    const promise =
      kind === "set"
        ? options.setOverride({
            locationId: targetLocationId,
            request: request as BrandingSetRequest,
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
          // The authoritative full read envelope replaces visible state:
          data: response,
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
        if (isBrandingConflictError(error)) {
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
    setOverride(input: { setting: BrandingSetting; value: string }): void {
      runMutation("set", input.setting, input.value);
    },
    clearOverride(setting: BrandingSetting): void {
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
