const key = "vaylet:guest-presentation-context:v1";

/** Random presentation namespace only: never a bearer, cookie secret or authority. */
export function guestPresentationContext(rotate = false): string | null {
  try {
    const storage = window.sessionStorage;
    const previous = storage.getItem(key);
    if (!rotate && previous) return previous;
    const next = window.crypto.randomUUID();
    storage.setItem(key, next);
    return next;
  } catch {
    return null;
  }
}
