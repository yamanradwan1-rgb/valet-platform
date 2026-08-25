const EMPTY_TYPE_FALLBACK = "—";

/**
 * Incident `type` is a free backend string (for example "KEY_MISSING"), not a
 * controlled enum, so it cannot be translated like one. Following the final
 * D1 reference it is humanized (underscores become spaces, Title Case)
 * without inventing meaning beyond the stored value.
 */
export function humanizeIncidentType(type: string): string {
  const trimmed = type.trim();
  if (trimmed.length === 0) return EMPTY_TYPE_FALLBACK;
  return trimmed
    .replace(/_/gu, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/gu, (character) => character.toUpperCase());
}
