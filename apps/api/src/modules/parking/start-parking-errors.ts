export type StartParkingErrorCode =
  | "INVALID_STATE_TRANSITION"
  | "KEY_CUSTODY_NOT_READY"
  | "TASK_INVALID_STATE"
  | "TASK_NOT_FOUND_OR_FORBIDDEN"
  | "VERSION_CONFLICT";

const messages: Record<StartParkingErrorCode, string> = {
  INVALID_STATE_TRANSITION: "The ValetSession cannot start Parking.",
  KEY_CUSTODY_NOT_READY: "Key custody is not ready for Parking.",
  TASK_INVALID_STATE: "The Parking Task cannot be started.",
  TASK_NOT_FOUND_OR_FORBIDDEN: "The requested resource is not available.",
  VERSION_CONFLICT: "The parking operation was changed by another operation.",
};

export class StartParkingError extends Error {
  readonly code: StartParkingErrorCode;

  constructor(code: StartParkingErrorCode) {
    super(messages[code]);
    this.code = code;
    this.name = "StartParkingError";
  }
}
