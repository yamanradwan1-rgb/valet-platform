import type { GuestSafeSession } from "../../lib/api/guest-api-types";

export type GuestReadyAlertDecision =
  | { readonly kind: "BASELINE" }
  | { readonly kind: "NONE" }
  | { readonly identity: string; readonly kind: "PRESENT" }
  | { readonly identity: string; readonly kind: "SUPPRESS_COMPLETED" };

export interface GuestReadyAlertTracker {
  activeValetSessionId: string | null;
  baselineEstablished: boolean;
  readonly observedIdentities: Set<string>;
}

function readyIdentity(session: GuestSafeSession): string | null {
  return session.readyAt === null
    ? null
    : `${session.valetSessionId}:${session.readyAt}`;
}

export function observeGuestReadyIdentity(
  tracker: GuestReadyAlertTracker,
  identity: string,
  activeValetSessionId: string,
): boolean {
  if (!identity.startsWith(`${activeValetSessionId}:`)) return false;
  const readyAt = identity.slice(activeValetSessionId.length + 1);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(readyAt))
    return false;
  tracker.observedIdentities.add(identity);
  return true;
}

export function createGuestReadyAlertTracker(
  initialSession: GuestSafeSession | null,
): GuestReadyAlertTracker {
  const tracker: GuestReadyAlertTracker = {
    activeValetSessionId: null,
    baselineEstablished: false,
    observedIdentities: new Set<string>(),
  };
  if (initialSession !== null)
    observeGuestReadySnapshot(tracker, initialSession);
  return tracker;
}

export function resetGuestReadyAlertTracker(
  tracker: GuestReadyAlertTracker,
): void {
  tracker.activeValetSessionId = null;
  tracker.baselineEstablished = false;
  tracker.observedIdentities.clear();
}

export function observeGuestReadySnapshot(
  tracker: GuestReadyAlertTracker,
  session: GuestSafeSession,
): GuestReadyAlertDecision {
  if (tracker.activeValetSessionId !== session.valetSessionId) {
    tracker.activeValetSessionId = session.valetSessionId;
    tracker.baselineEstablished = false;
    tracker.observedIdentities.clear();
  }

  const identity = readyIdentity(session);
  if (!tracker.baselineEstablished) {
    tracker.baselineEstablished = true;
    if (identity !== null) tracker.observedIdentities.add(identity);
    return { kind: "BASELINE" };
  }

  if (identity === null || tracker.observedIdentities.has(identity)) {
    return { kind: "NONE" };
  }

  tracker.observedIdentities.add(identity);
  return session.state === "COMPLETED"
    ? { identity, kind: "SUPPRESS_COMPLETED" }
    : { identity, kind: "PRESENT" };
}
