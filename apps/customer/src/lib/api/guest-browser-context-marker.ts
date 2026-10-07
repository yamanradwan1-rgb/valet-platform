export const GUEST_CONTEXT_CHANGED_EVENT = 'vaylet:guest-context-changed';

const GUEST_CONTEXT_COOKIE = '__Host-vaylet_guest_context';
const contextMarkerPattern = /^vgc1\.[0-9a-f]{32}$/;

export function readBrowserContextMarker(): string | null {
  if (typeof document === 'undefined') return null;
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== GUEST_CONTEXT_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return contextMarkerPattern.test(value) ? value : null;
  }
  return null;
}

export function announceBrowserContextChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(GUEST_CONTEXT_CHANGED_EVENT));
  }
}
