export type StartRetrievalErrorCode =
  | "INVALID_STATE_TRANSITION"
  | "KEY_CUSTODY_NOT_READY"
  | "RETRIEVAL_REQUEST_NOT_READY"
  | "TASK_INVALID_STATE"
  | "TASK_NOT_FOUND_OR_FORBIDDEN"
  | "VERSION_CONFLICT";

const messages: Record<StartRetrievalErrorCode, string> = {
  INVALID_STATE_TRANSITION: "The ValetSession cannot start Retrieval.",
  KEY_CUSTODY_NOT_READY: "Key custody is not ready for Retrieval.",
  RETRIEVAL_REQUEST_NOT_READY: "The Retrieval request is not ready.",
  TASK_INVALID_STATE: "The Retrieval Task cannot be started.",
  TASK_NOT_FOUND_OR_FORBIDDEN: "The requested resource is not available.",
  VERSION_CONFLICT: "The retrieval operation was changed by another operation.",
};

export class StartRetrievalError extends Error {
  readonly code: StartRetrievalErrorCode;

  constructor(code: StartRetrievalErrorCode) {
    super(messages[code]);
    this.code = code;
    this.name = "StartRetrievalError";
  }
}
