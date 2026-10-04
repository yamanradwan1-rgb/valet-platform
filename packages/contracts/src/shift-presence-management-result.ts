/** Absence/equality never substitutes for exact terminal mutation proof. */
export function validPresenceManagementAttribution(result: {
  attribution: "COMMITTED" | "UNKNOWN";
  effect: "CHANGED" | "NO_CHANGE" | null;
  entityId: string | null;
  revision: number | null;
  canonical: { kind: string; value: unknown };
}) {
  if (result.attribution === "UNKNOWN")
    return (
      result.effect === null &&
      result.entityId === null &&
      result.revision === null
    );
  if (
    result.effect === null ||
    result.entityId === null ||
    result.revision === null
  )
    return false;
  return (
    result.canonical.kind !== "ZONE" ||
    (result.canonical.value as { zone: unknown }).zone !== null
  );
}
