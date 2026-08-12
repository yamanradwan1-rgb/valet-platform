export type ShiftOperationErrorCode =
  | "ACTIVE_SHIFT_CONFLICT"
  | "AUTHORIZATION_DENIED"
  | "LOCATION_ACCESS_DENIED"
  | "TENANT_ACCESS_DENIED";

const messages: Record<ShiftOperationErrorCode, string> = {
  ACTIVE_SHIFT_CONFLICT:
    "The membership already has an active Shift at another location.",
  AUTHORIZATION_DENIED: "The requested resource is not available.",
  LOCATION_ACCESS_DENIED: "The requested resource is not available.",
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
