export class StaffPushRegistrationConflictError extends Error {
  readonly code = "STAFF_PUSH_REGISTRATION_CONFLICT";

  constructor() {
    super("The push registration could not be reconciled.");
    this.name = "StaffPushRegistrationConflictError";
  }
}

export class StaffPushRegistrationNotAvailableError extends Error {
  readonly code = "STAFF_PUSH_REGISTRATION_NOT_AVAILABLE";

  constructor() {
    super("The push registration is not available.");
    this.name = "StaffPushRegistrationNotAvailableError";
  }
}
