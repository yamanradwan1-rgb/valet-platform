/**
 * One-time Guest credential transport for the Customer browser entry.
 *
 * The owner-approved production transport is exactly
 * `#guestToken=<43-character-base64url-token>`: read browser-only after
 * mount, validated against the exact token shape, immediately scrubbed from
 * the address bar via history.replaceState, and adopted only when safe
 * scrubbing succeeds. The credential stays memory-only; any full reload
 * after scrubbing intentionally loses access until the original link is
 * reopened or Staff reissues Guest Access.
 *
 * Malformed guest fragments are scrubbed and rejected (fail closed). A
 * scrubbing failure never adopts the token. No logging, no persistence.
 */

export const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const GUEST_FRAGMENT_PREFIX = "#guestToken=";

function scrubFragment(): boolean {
  try {
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, "", cleanUrl);
    return true;
  } catch {
    // Fail closed: never adopt a credential whose scrubbing failed.
    return false;
  }
}

export function extractGuestFragmentToken(): string | null {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash;
  if (!hash.startsWith(GUEST_FRAGMENT_PREFIX)) return null;

  const candidate = hash.slice(GUEST_FRAGMENT_PREFIX.length);
  if (!scrubFragment()) return null;

  return GUEST_TOKEN_PATTERN.test(candidate) ? candidate : null;
}
