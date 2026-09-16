export class MfaEnrollmentNotAvailableError extends Error {
  readonly code = "MFA_ENROLLMENT_NOT_AVAILABLE";

  constructor() {
    super("MFA enrollment is not available.");
    this.name = "MfaEnrollmentNotAvailableError";
  }
}

export class MfaVerificationFailedError extends Error {
  readonly code = "MFA_VERIFICATION_FAILED";

  constructor() {
    super("MFA verification failed.");
    this.name = "MfaVerificationFailedError";
  }
}

export class MfaVerificationRateLimitedError extends Error {
  readonly code = "MFA_RATE_LIMITED";

  constructor(readonly retryAfter: number) {
    super("Too many requests. Try again later.");
    this.name = "MfaVerificationRateLimitedError";
  }
}

export class MfaStepUpRequiredError extends Error {
  readonly code = "MFA_STEP_UP_REQUIRED";

  constructor() {
    super("Additional authentication is required.");
    this.name = "MfaStepUpRequiredError";
  }
}
