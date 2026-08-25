import type { DashboardSessionState } from "@valet/contracts";

/**
 * Client-side state filter for the Vehicles in Service list.
 *
 * The backend sessions-list query intentionally excludes COMPLETED sessions,
 * so COMPLETED is not a filter option here. It remains a valid global session
 * state (overview counts and other contexts still use it); it is only absent
 * from this surface's filter model.
 */
export type SessionStateFilterValue = "ALL" | Exclude<
  DashboardSessionState,
  "COMPLETED"
>;

/** Chip order follows the D1 reference. */
export const SESSION_STATE_FILTER_OPTIONS: readonly SessionStateFilterValue[] =
  [
    "ALL",
    "CHECKING_IN",
    "AWAITING_PARKING",
    "PARKING",
    "PARKED",
    "REQUESTED",
    "RETRIEVING",
    "READY",
    "HANDOFF_PENDING",
  ];

export function isSessionStateFilterValue(
  value: unknown,
): value is SessionStateFilterValue {
  return (
    SESSION_STATE_FILTER_OPTIONS as readonly unknown[]
  ).includes(value);
}

/**
 * Filters the already-loaded rows only. This is honest client-side narrowing:
 * the hint on the page states that filters apply to the loaded results, so a
 * short filtered view can never be mistaken for the full backend result set.
 */
export function applySessionStateFilter<Item extends { state: string }>(
  items: readonly Item[],
  filter: SessionStateFilterValue,
): readonly Item[] {
  if (filter === "ALL") return items;
  return items.filter((item) => item.state === filter);
}
