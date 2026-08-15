export type ShiftOperationErrorCode =
  | "ACTIVE_SHIFT_CONFLICT"
  | "AUTHORIZATION_DENIED"
  | "LOCATION_ACCESS_DENIED"
  | "OPEN_TASK_HANDOFF_REQUIRED"
  | "SHIFT_CASH_REPORT_INVALID"
  | "SHIFT_CASH_RECONCILIATION_UNAVAILABLE"
  | "TENANT_ACCESS_DENIED";

const messages: Record<ShiftOperationErrorCode, string> = {
  ACTIVE_SHIFT_CONFLICT:
    "The membership already has an active Shift at another location.",
  AUTHORIZATION_DENIED: "The requested resource is not available.",
  LOCATION_ACCESS_DENIED: "The requested resource is not available.",
  OPEN_TASK_HANDOFF_REQUIRED:
    "Open Task ownership must be handed off before ending the Shift.",
  SHIFT_CASH_REPORT_INVALID: "The Shift cash report is invalid.",
  SHIFT_CASH_RECONCILIATION_UNAVAILABLE:
    "The Shift cash reconciliation is not available.",
  TENANT_ACCESS_DENIED: "The requested resource is not available.",
};

export class ShiftOperationError extends Error {
  readonly code: ShiftOperationErrorCode;

  constructor(code: ShiftOperationErrorCode) {
    super(messages[code]);
    this.code = code;
    this.name = "ShiftOperationError";
  }
}
