export type GpsIngestionErrorCode =
  | "GPS_SAMPLE_IDEMPOTENCY_CONFLICT"
  | "REQUEST_INVALID"
  | "TASK_INVALID_STATE"
  | "TASK_NOT_FOUND_OR_FORBIDDEN";

const messages: Record<GpsIngestionErrorCode, string> = {
  GPS_SAMPLE_IDEMPOTENCY_CONFLICT:
    "A GPS sample identifier was already used with different data.",
  REQUEST_INVALID: "The GPS sample batch is invalid.",
  TASK_INVALID_STATE: "GPS tracking is not active for this movement Task.",
  TASK_NOT_FOUND_OR_FORBIDDEN: "The requested resource is not available.",
};

export class GpsIngestionError extends Error {
  readonly code: GpsIngestionErrorCode;

  constructor(code: GpsIngestionErrorCode) {
    super(messages[code]);
    this.code = code;
    this.name = "GpsIngestionError";
  }
}
