export class WebPushUnavailableError extends Error {
  readonly code = "WEB_PUSH_UNAVAILABLE";

  constructor() {
    super("Web Push subscriptions are unavailable.");
    this.name = "WebPushUnavailableError";
  }
}

export class WebPushSubscriptionConflictError extends Error {
  readonly code = "WEB_PUSH_SUBSCRIPTION_CONFLICT";

  constructor() {
    super("The Web Push subscription could not be registered.");
    this.name = "WebPushSubscriptionConflictError";
  }
}

export class WebPushSubscriptionNotAvailableError extends Error {
  readonly code = "WEB_PUSH_SUBSCRIPTION_NOT_AVAILABLE";

  constructor() {
    super("The requested resource is not available.");
    this.name = "WebPushSubscriptionNotAvailableError";
  }
}
