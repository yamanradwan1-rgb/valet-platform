import type { SessionOverviewEntry } from "@valet/contracts";

import { sessionStateLabelKey } from "../../i18n/enum-labels";
import { shortIdentifier, shortIdentifierOr } from "../../lib/format/identifier-format";
import type { SessionStateFilterValue } from "./session-state-filters";

/**
 * Display helpers for the Vehicles in Service surface. Nullable contract
 * fields map to honest human fallbacks; unknown data never becomes invented
 * authoritative values.
 */

/** Plate-based label with descriptor/neutral fallbacks (D1 priority). */
export function vehicleDisplayLabel(
  entry: SessionOverviewEntry,
  fallback: string,
): string {
  const plate = entry.vehicle.plateNumberNormalized;
  if (plate !== null && plate.length > 0) {
    const country = entry.vehicle.plateCountry;
    return country !== null && country.length > 0 ? `${plate} · ${country}` : plate;
  }
  const descriptor = entry.vehicle.temporaryDescriptor;
  if (descriptor !== null && descriptor.length > 0) return descriptor;
  return fallback;
}

export const UNSET_VALUE_FALLBACK = "—";

export function optionalIdOrDash(value: string | null): string {
  return shortIdentifierOr(value, UNSET_VALUE_FALLBACK);
}

export function assigneeCellText(
  membershipId: string | null,
  unassignedLabel: string,
): string {
  return membershipId === null ? unassignedLabel : shortIdentifier(membershipId);
}

export function sessionIdCell(entry: SessionOverviewEntry): string {
  return shortIdentifier(entry.sessionId);
}

/** Filter chips use the same typed enum labels as status badges. */
export function sessionFilterLabelKey(
  filter: Exclude<SessionStateFilterValue, "ALL">,
): ReturnType<typeof sessionStateLabelKey> {
  return sessionStateLabelKey(filter);
}

/** Guard used by tests: every supported non-completed state has a label. */
export function supportedSessionStates(): readonly Exclude<
  SessionOverviewEntry["state"],
  "COMPLETED"
>[] {
  return [
    "CHECKING_IN",
    "AWAITING_PARKING",
    "PARKING",
    "PARKED",
    "REQUESTED",
    "RETRIEVING",
    "READY",
    "HANDOFF_PENDING",
  ];
}
