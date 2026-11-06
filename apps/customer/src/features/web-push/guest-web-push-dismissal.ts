import { readBrowserContextMarker } from "../../lib/api/guest-browser-context-marker";

// This is document-lifetime UI state, scoped to the currently mounted Guest
// browser context. A successful visit switch rotates the context marker.
const dismissedContextByDocument = new WeakMap<Document, string | null>();

export function hasDismissedGuestPushCard(): boolean {
  return (
    typeof document !== "undefined" &&
    dismissedContextByDocument.get(document) === readBrowserContextMarker()
  );
}

export function dismissGuestPushCard(contextAtMount: string | null): void {
  // A stale card can receive a click after the cookie rotates; the dismissal
  // must still belong to the visit that rendered that card.
  dismissedContextByDocument.set(document, contextAtMount);
}
