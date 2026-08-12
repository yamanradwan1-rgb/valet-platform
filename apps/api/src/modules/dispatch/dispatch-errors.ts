export type DispatchOperationErrorCode =
  | "TASK_NOT_FOUND_OR_FORBIDDEN"
  | "TASK_INVALID_STATE"
  | "TASK_ASSIGNEE_NOT_ELIGIBLE"
  | "TASK_REASSIGN_REASON_REQUIRED"
  | "TASK_ASSIGNMENT_CONFLICT"
  | "VERSION_CONFLICT";

const messages: Record<DispatchOperationErrorCode, string> = {
  TASK_ASSIGNEE_NOT_ELIGIBLE: "The requested assignee is not eligible.",
  TASK_ASSIGNMENT_CONFLICT: "The requested assignment is not permitted.",
  TASK_INVALID_STATE: "The Task cannot perform the requested transition.",
  TASK_NOT_FOUND_OR_FORBIDDEN: "The requested resource is not available.",
  TASK_REASSIGN_REASON_REQUIRED: "A reassignment reason is required.",
  VERSION_CONFLICT: "The Task was changed by another operation.",
};

export class DispatchOperationError extends Error {
  readonly code: DispatchOperationErrorCode;

  constructor(code: DispatchOperationErrorCode) {
    super(messages[code]);
    this.code = code;
    this.name = "DispatchOperationError";
  }
}
