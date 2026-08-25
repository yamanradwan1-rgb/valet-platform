const MIN_SHORTENED_LENGTH = 13;

/**
 * D1-style compact identifier for narrow surfaces (`954bed5d…fa01`).
 * Membership and session IDs stay opaque references; they are never dressed
 * up as names or profiles.
 */
export function shortIdentifier(value: string): string {
  return value.length <= MIN_SHORTENED_LENGTH
    ? value
    : `${value.slice(0, 8)}…${value.slice(-4)}`;
}
