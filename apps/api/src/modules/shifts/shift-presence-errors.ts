export type ShiftPresenceErrorCode =
  | "PRESENCE_SCOPE_MISMATCH"
  | "PRESENCE_OPERATION_CONFLICT"
  | "PRESENCE_OPERATION_EXPIRED"
  | "PRESENCE_CHALLENGE_EXPIRED"
  | "PRESENCE_CHALLENGE_CONSUMED"
  | "PRESENCE_CAS_CONFLICT"
  | "PRESENCE_AUTHORITY_BUSY"
  | "PRESENCE_SECURITY_UNAVAILABLE"
  | "PRESENCE_REQUIRED"
  | "PRESENCE_REJECTED"
  | "APPROVER_AUTHORITY_REVOKED";

/** Internal codes only; GPS-B owns public transport mapping. */
export class ShiftPresenceError extends Error {
  constructor(readonly code: ShiftPresenceErrorCode) {
    super(code);
    this.name = "ShiftPresenceError";
  }
}
