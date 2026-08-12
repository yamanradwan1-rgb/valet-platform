export type ConfirmParkedErrorCode =
  | "INVALID_STATE_TRANSITION"
  | "KEY_CUSTODY_NOT_READY"
  | "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE"
  | "TASK_INVALID_STATE"
  | "TASK_NOT_FOUND_OR_FORBIDDEN"
  | "VERSION_CONFLICT";

const messages: Record<ConfirmParkedErrorCode, string> = {
  INVALID_STATE_TRANSITION: "The ValetSession cannot be confirmed parked.",
  KEY_CUSTODY_NOT_READY: "Key custody is not ready for parking completion.",
  PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE:
    "The ParkingSpot is not available for this operation.",
  TASK_INVALID_STATE: "The Parking Task cannot be completed.",
  TASK_NOT_FOUND_OR_FORBIDDEN: "The requested resource is not available.",
  VERSION_CONFLICT: "The parking operation was changed by another operation.",
};

export class ConfirmParkedError extends Error {
  readonly code: ConfirmParkedErrorCode;

  constructor(code: ConfirmParkedErrorCode) {
    super(messages[code]);
    this.code = code;
    this.name = "ConfirmParkedError";
  }
}
