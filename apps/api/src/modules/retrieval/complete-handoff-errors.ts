export type CompleteHandoffErrorCode =
  | "HANDOFF_VERIFICATION_FAILED"
  | "INVALID_STATE_TRANSITION"
  | "KEY_CUSTODY_NOT_READY"
  | "RETRIEVAL_REQUEST_NOT_READY"
  | "TASK_INVALID_STATE"
  | "TASK_NOT_FOUND_OR_FORBIDDEN"
  | "VERSION_CONFLICT";

const messages: Readonly<Record<CompleteHandoffErrorCode, string>> = {
  HANDOFF_VERIFICATION_FAILED: "Handoff verification failed.",
  INVALID_STATE_TRANSITION: "The handoff operation is not valid now.",
  KEY_CUSTODY_NOT_READY: "Key custody is not ready.",
  RETRIEVAL_REQUEST_NOT_READY: "The RetrievalRequest is not ready.",
  TASK_INVALID_STATE: "The Retrieval Task is not in the required state.",
  TASK_NOT_FOUND_OR_FORBIDDEN: "The Task was not found or is not accessible.",
  VERSION_CONFLICT: "The handoff operation was changed by another operation.",
};

export class CompleteHandoffError extends Error {
  constructor(readonly code: CompleteHandoffErrorCode) {
    super(messages[code]);
    this.name = "CompleteHandoffError";
  }
}
