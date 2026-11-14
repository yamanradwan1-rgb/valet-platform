export class Issue416ResetUnavailableError extends Error {
  readonly code = "STAFF_PASSWORD_RESET_UNAVAILABLE";

  constructor() {
    super("Service temporarily unavailable.");
    this.name = "Issue416ResetUnavailableError";
  }
}

export class Issue416ResetRateLimitedError extends Error {
  readonly code = "STAFF_PASSWORD_RESET_RATE_LIMITED";

  constructor(readonly retryAfter: number) {
    super("Too many requests. Try again later.");
    this.name = "Issue416ResetRateLimitedError";
  }
}

export class Issue416ResetInvalidError extends Error {
  readonly code = "STAFF_PASSWORD_RESET_INVALID";

  constructor() {
    super("The password reset link is invalid.");
    this.name = "Issue416ResetInvalidError";
  }
}
