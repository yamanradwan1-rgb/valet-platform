/**
 * Development-only token acquisition adapter.
 * The production repository does not yet define a permanent browser URL/cookie
 * entry transport. In development/testing mode, tokens may be supplied via
 * memory or a one-time URL fragment (`#guestToken=<token>`) which is immediately
 * scrubbed from browser history and kept only in memory.
 */
export function extractDevFragmentToken(): string | null {
  if (typeof window === 'undefined') return null;

  // Fragment token transport is strictly disabled in production
  if (process.env.NODE_ENV === 'production') return null;

  const hash = window.location.hash;
  if (!hash || !hash.includes('guestToken=')) return null;

  const match = /#guestToken=([A-Za-z0-9_-]+)/.exec(hash);
  if (!match || !match[1]) return null;

  const token = match[1];

  // Immediately scrub the fragment from URL and history
  try {
    const cleanUrl = window.location.pathname + window.location.search;
    window.history.replaceState(null, '', cleanUrl);
  } catch {
    // If replaceState fails, at least clear the hash
    window.location.hash = '';
  }

  return token;
}
