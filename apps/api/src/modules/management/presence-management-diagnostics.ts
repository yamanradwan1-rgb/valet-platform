import { Logger } from "@nestjs/common";
import { ShiftPresenceError } from "../shifts/shift-presence-errors";

export type PresenceManagementBusyOrigin =
  | "ADVISORY_TRY_LOCK_BUSY"
  | "POSTGRES_LOCK_NOT_AVAILABLE_55P03"
  | "POSTGRES_DEADLOCK_40P01"
  | "READ_BUDGET_EXHAUSTED";

export type PresenceManagementOperation =
  | "COMPANY_POLICY_READ"
  | "LOCATION_POLICY_READ"
  | "ZONE_LIST"
  | "ZONE_READ"
  | "COMPANY_POLICY_SET"
  | "LOCATION_POLICY_CHANGE"
  | "ZONE_SAVE"
  | "EXCEPTION_LIST"
  | "EXCEPTION_READ"
  | "EXCEPTION_REVIEW"
  | "RESULT_READ";

/** Only the early, pre-operation boundary creates the retryable origin. */
export class PresenceManagementBusyError extends ShiftPresenceError {
  constructor(readonly origin: PresenceManagementBusyOrigin) {
    super("PRESENCE_AUTHORITY_BUSY");
  }
}

export function presenceManagementBusyOrigin(
  error: unknown,
): PresenceManagementBusyOrigin | undefined {
  if (error instanceof PresenceManagementBusyError) return error.origin;
  const code = (error as { code?: string } | null)?.code;
  if (code === "55P03") return "POSTGRES_LOCK_NOT_AVAILABLE_55P03";
  if (code === "40P01") return "POSTGRES_DEADLOCK_40P01";
  return undefined;
}

const logger = new Logger("PresenceManagement");

/** One bounded summary per affected operation; never serialize an Error or scope. */
export function recordPresenceManagementBusy(
  operation: PresenceManagementOperation,
  origin: PresenceManagementBusyOrigin,
  attempts: number,
  durationMs: number,
  outcome: "RECOVERED" | "DENIED" | "FAILED",
): void {
  try {
    const line = `PRESENCE_MANAGEMENT operation=${operation} origin=${origin} outcome=${outcome} attempts=${attempts} durationMs=${Math.max(0, Math.round(durationMs))}`;
    if (origin === "POSTGRES_DEADLOCK_40P01") logger.error(line);
    else logger.warn(line);
  } catch {
    // Diagnostics cannot change the protected operation's result.
  }
}
