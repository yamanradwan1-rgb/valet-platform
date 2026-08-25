/**
 * Display formatting for backend identifiers.
 *
 * UUIDs are reference data on management surfaces. They are shortened to a
 * stable head…tail form so rows stay scannable; the full value always remains
 * available in detail surfaces. Null identifiers never become invented values
 * here — callers decide the human fallback.
 */
export function shortIdentifier(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function shortIdentifierOr(
  value: string | null,
  fallback: string,
): string {
  return value === null ? fallback : shortIdentifier(value);
}
