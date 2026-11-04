import { managementAlertTimingPreferenceDefaults } from "@valet/contracts";

const approvedKeys = new Set(
  Object.keys(managementAlertTimingPreferenceDefaults),
);

/** Safe CA Audit Explorer detail: names of changed fields and revision only. */
export function projectManagementAlertTimingAuditDetails(value: unknown) {
  const empty = { kind: "MANAGEMENT" as const };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return empty;
  }
  const source = value as Record<string, unknown>;
  const { changedKeys, beforeRevision, afterRevision } = source;
  if (
    typeof changedKeys !== "string" ||
    changedKeys.length < 1 ||
    changedKeys.length > 144 ||
    !Number.isSafeInteger(beforeRevision) ||
    !Number.isSafeInteger(afterRevision) ||
    typeof beforeRevision !== "number" ||
    typeof afterRevision !== "number" ||
    beforeRevision < 0 ||
    afterRevision !== beforeRevision + 1
  ) {
    return empty;
  }
  const keys = changedKeys.split(",");
  if (
    keys.length < 1 ||
    keys.length > approvedKeys.size ||
    new Set(keys).size !== keys.length ||
    keys.some((key) => !approvedKeys.has(key))
  ) {
    return empty;
  }
  // Values and arbitrary metadata never cross the projection boundary.
  return { ...empty, changedKeys: keys, beforeRevision, afterRevision };
}
