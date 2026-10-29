export type MarkReadyErrorCode =
  | "INVALID_STATE_TRANSITION"
  | "KEY_CUSTODY_NOT_READY"
  | "RETRIEVAL_REQUEST_NOT_READY"
  | "TASK_INVALID_STATE"
  | "TASK_NOT_FOUND_OR_FORBIDDEN"
  | "VERSION_CONFLICT";

const messages: Record<MarkReadyErrorCode, string> = {
  INVALID_STATE_TRANSITION: "The ValetSession cannot be marked ready.",
  KEY_CUSTODY_NOT_READY: "Key custody is not ready.",
  RETRIEVAL_REQUEST_NOT_READY: "The Retrieval request is not ready.",
  TASK_INVALID_STATE: "The Retrieval Task cannot mark the vehicle ready.",
  TASK_NOT_FOUND_OR_FORBIDDEN: "The requested resource is not available.",
  VERSION_CONFLICT: "The retrieval operation was changed by another operation.",
};

export class MarkReadyError extends Error {
  readonly code: MarkReadyErrorCode;

  constructor(code: MarkReadyErrorCode) {
    super(messages[code]);
    this.code = code;
    this.name = "MarkReadyError";
  }
}
