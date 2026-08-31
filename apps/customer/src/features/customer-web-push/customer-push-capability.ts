export type CustomerPushCapabilityState =
  | "UNAVAILABLE"
  | "UNSUPPORTED"
  | "IOS_REQUIRES_HOME_SCREEN"
  | "PROMPT_AVAILABLE"
  | "DENIED"
  | "GRANTED_UNSUBSCRIBED"
  | "SUBSCRIBED"
  | "RECOVERABLE_ERROR";

export interface CustomerPushCapabilitySnapshot {
  readonly isIosLike: boolean;
  readonly isStandalone: boolean;
  readonly notification: boolean;
  readonly permission: NotificationPermission;
  readonly pushManager: boolean;
  readonly serviceWorker: boolean;
}

export function resolveCustomerPushCapability(
  snapshot: CustomerPushCapabilitySnapshot,
  configured: boolean,
  hasSubscription: boolean,
): CustomerPushCapabilityState {
  if (!configured) return "UNAVAILABLE";
  if (snapshot.isIosLike && !snapshot.isStandalone) {
    return "IOS_REQUIRES_HOME_SCREEN";
  }
  if (
    !snapshot.notification ||
    !snapshot.pushManager ||
    !snapshot.serviceWorker
  ) {
    return "UNSUPPORTED";
  }
  if (snapshot.permission === "denied") return "DENIED";
  if (snapshot.permission === "default") return "PROMPT_AVAILABLE";
  return hasSubscription ? "SUBSCRIBED" : "GRANTED_UNSUBSCRIBED";
}
