import type { DashboardAuthorizedLocation } from "@valet/contracts";

/**
 * Pure state machine for the D2-005 authorized-location bootstrap.
 *
 * Kept free of React so the security-relevant rules are directly
 * unit-testable:
 *
 * - "loading", "error" and "ready with zero locations" are distinct states;
 *   a network failure is never represented as an empty authorization list.
 * - a selection is only ever accepted when the location exists in the fresh
 *   authorized list (an arbitrary or previously-authorized id is discarded).
 * - the deterministic fallback is the first backend entry (name ASC, id ASC).
 * - revalidation (authorization drift) keeps the current selection only if
   it is still present in the freshly returned list.
 */

export type AuthorizedDashboardLocation = DashboardAuthorizedLocation;

export interface LocationBootstrapError {
  readonly error: unknown;
}

export type LocationBootstrapState =
  | { readonly phase: "loading" }
  | { readonly phase: "error"; readonly error: unknown }
  /**
   * Ready with zero entries means the backend answered successfully and the
   * authenticated account holds no authorized LOCATION_MANAGER locations —
   * a no-access posture, never a network failure.
   */
  | {
      readonly phase: "ready";
      readonly locations: readonly AuthorizedDashboardLocation[];
      readonly selectedId: string | null;
    };

export function createBootstrapLoadingState(): LocationBootstrapState {
  return { phase: "loading" };
}

/** Transport/server failure: distinct from zero authorized locations. */
export function bootstrapFailed(error: unknown): LocationBootstrapState {
  return { phase: "error", error };
}

function findAuthorized(
  locations: readonly AuthorizedDashboardLocation[],
  locationId: string | null,
): AuthorizedDashboardLocation | null {
  if (locationId === null) return null;
  return locations.find((entry) => entry.locationId === locationId) ?? null;
}

/** Membership test used to guard explicit selection requests. */
export function isAuthorizedLocation(
  locations: readonly AuthorizedDashboardLocation[] | null,
  locationId: string,
): boolean {
  return locations !== null && findAuthorized(locations, locationId) !== null;
}

/**
 * Applies a successful bootstrap. A persisted/preferred location id is only
 * a UX preference: it is used exclusively when it still appears in the fresh
 * authorized list; otherwise the deterministic first entry is selected.
 */
export function bootstrapSucceeded(
  locations: readonly AuthorizedDashboardLocation[],
  preferredLocationId?: string | null,
): LocationBootstrapState {
  const preferred = findAuthorized(locations, preferredLocationId ?? null);
  return {
    phase: "ready",
    locations,
    selectedId:
      preferred !== null ? preferred.locationId : (locations[0]?.locationId ?? null),
  };
}

/**
 * Explicit user selection. Requests for ids outside the authorized list are
 * ignored — selection can never grant authorization.
 */
export function selectAuthorizedLocation(
  state: LocationBootstrapState,
  locationId: string,
): LocationBootstrapState {
  if (state.phase !== "ready") return state;
  if (findAuthorized(state.locations, locationId) === null) return state;
  return { ...state, selectedId: locationId };
}

/**
 * Applies a refetched authorized list against an existing ready state
 * (authorization drift): keep the selection only while it remains
 * authorized, otherwise fall back deterministically; zero remaining entries
 * yields the empty ready (no-access) state.
 */
export function revalidateSucceeded(
  state: LocationBootstrapState,
  locations: readonly AuthorizedDashboardLocation[],
): LocationBootstrapState {
  if (state.phase !== "ready") {
    return bootstrapSucceeded(locations);
  }
  return bootstrapSucceeded(locations, state.selectedId);
}
