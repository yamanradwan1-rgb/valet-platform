import {
  observeGuestReadyIdentity,
  type GuestReadyAlertTracker,
} from "../ready-alert/guest-ready-alert-tracker";

const IDENTITY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/i;

export function handleCustomerPushClientMessage(
  candidate: unknown,
  tracker: GuestReadyAlertTracker,
  activeValetSessionId: string | null,
  refreshCanonicalSession: () => void,
): boolean {
  if (
    !activeValetSessionId ||
    typeof candidate !== "object" ||
    candidate === null
  ) {
    return false;
  }
  const message = candidate as Record<string, unknown>;
  if (
    message.route !== "GUEST_HOME" ||
    typeof message.identity !== "string" ||
    !IDENTITY_PATTERN.test(message.identity) ||
    (message.type !== "VAYLET_CUSTOMER_PUSH_OBSERVED" &&
      message.type !== "VAYLET_CUSTOMER_NOTIFICATION_CLICK")
  ) {
    return false;
  }
  if (
    !observeGuestReadyIdentity(tracker, message.identity, activeValetSessionId)
  ) {
    return false;
  }
  refreshCanonicalSession();
  return true;
}

export function respondToCustomerAuthProbe(
  candidate: unknown,
  ports: ReadonlyArray<{ postMessage(value: unknown): void }>,
  activeValetSessionId: string | null,
): boolean {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    (candidate as Record<string, unknown>).type !==
      "VAYLET_CUSTOMER_AUTH_PROBE" ||
    !ports[0]
  ) {
    return false;
  }
  const identity = (candidate as Record<string, unknown>).identity;
  const authorized =
    activeValetSessionId !== null &&
    typeof identity === "string" &&
    IDENTITY_PATTERN.test(identity) &&
    identity.startsWith(`${activeValetSessionId}:`);
  ports[0].postMessage({ authorized, type: "VAYLET_CUSTOMER_AUTH_RESULT" });
  return true;
}
