import type { HistoricalStaffName } from "@valet/contracts";

export interface CanonicalHistoryMembershipName {
  readonly membershipId: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
}

function canonicalComponent(value: string | null): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value &&
    Array.from(value).length <= 100 &&
    !Array.from(value).some(
      (character) =>
        character.length === 1 &&
        character.charCodeAt(0) >= 0xd800 &&
        character.charCodeAt(0) <= 0xdfff,
    )
  );
}

// Historical subjects need not be currently active or granted. Only current
// canonical, complete names from the correct Organization may be projected.
export function canonicalHistoryName(
  row: CanonicalHistoryMembershipName | undefined,
): HistoricalStaffName | null {
  return row !== undefined &&
    canonicalComponent(row.firstName) &&
    canonicalComponent(row.lastName)
    ? { firstName: row.firstName, lastName: row.lastName }
    : null;
}
