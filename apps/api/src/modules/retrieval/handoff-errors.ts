export type HandoffErrorCode =
  | "HANDOFF_ABORT_REASON_REQUIRED"
  | "HANDOFF_METHOD_NOT_ALLOWED"
  | "HANDOFF_OVERRIDE_NOT_ALLOWED"
  | "HANDOFF_OVERRIDE_REASON_REQUIRED"
  | "HANDOFF_SECURITY_UNAVAILABLE"
  | "HANDOFF_VERIFICATION_ALREADY_ISSUED"
  | "HANDOFF_VERIFICATION_ALREADY_VERIFIED"
  | "HANDOFF_VERIFICATION_FAILED"
  | "HANDOFF_VERIFICATION_NOT_ACTIVE"
  | "HANDOFF_VERIFICATION_RATE_LIMITED"
  | "INVALID_STATE_TRANSITION"
  | "RETRIEVAL_REQUEST_NOT_READY"
  | "TASK_INVALID_STATE"
  | "TASK_NOT_FOUND_OR_FORBIDDEN"
  | "VERSION_CONFLICT";

const messages: Readonly<Record<HandoffErrorCode, string>> = {
  HANDOFF_ABORT_REASON_REQUIRED: "A handoff abort reason is required.",
  HANDOFF_METHOD_NOT_ALLOWED: "The selected handoff method is not allowed.",
  HANDOFF_OVERRIDE_NOT_ALLOWED: "Handoff override is not allowed.",
  HANDOFF_OVERRIDE_REASON_REQUIRED: "A handoff override reason is required.",
  HANDOFF_SECURITY_UNAVAILABLE: "Handoff verification is unavailable.",
  HANDOFF_VERIFICATION_ALREADY_ISSUED:
    "Handoff verification material is already active.",
  HANDOFF_VERIFICATION_ALREADY_VERIFIED: "Handoff is already verified.",
  HANDOFF_VERIFICATION_FAILED: "Handoff verification failed.",
  HANDOFF_VERIFICATION_NOT_ACTIVE: "Handoff verification is not active.",
  HANDOFF_VERIFICATION_RATE_LIMITED:
    "Too many handoff verification requests. Try again later.",
  INVALID_STATE_TRANSITION: "The handoff operation is not valid now.",
  RETRIEVAL_REQUEST_NOT_READY: "The RetrievalRequest is not ready.",
  TASK_INVALID_STATE: "The Retrieval Task is not in the required state.",
  TASK_NOT_FOUND_OR_FORBIDDEN: "The Task was not found or is not accessible.",
  VERSION_CONFLICT: "The handoff operation was changed by another operation.",
};

export class HandoffError extends Error {
  constructor(
    readonly code: HandoffErrorCode,
    readonly retryAfter?: number,
  ) {
    super(messages[code]);
    this.name = "HandoffError";
  }
}
