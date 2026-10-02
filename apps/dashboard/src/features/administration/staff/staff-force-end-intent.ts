import { staffShiftForceEndReasonSchema } from "@valet/contracts";
import { DashboardApiError } from "../../../lib/api/dashboard-api-error";

export type ForceEndFailure =
  | "mfa"
  | "retry"
  | "unknown"
  | "blocked"
  | "ended-conflict"
  | "conflict"
  | "denied"
  | "failed";

export function forceEndFailure(error: unknown): ForceEndFailure {
  if (!(error instanceof DashboardApiError)) return "unknown";
  if (error.kind === "mfa") return "mfa";
  if (error.code === "AUTH_RECONCILED_RETRY_REQUIRED") return "retry";
  if (error.kind === "network" || error.kind === "malformed") return "unknown";
  if (error.code === "OPEN_TASK_HANDOFF_REQUIRED") return "blocked";
  if (error.code === "SHIFT_ALREADY_ENDED") return "ended-conflict";
  if (error.code === "IDEMPOTENCY_CONFLICT") return "conflict";
  if (["authorization", "entitlement", "auth"].includes(error.kind))
    return "denied";
  return "failed";
}

/** Volatile logical-operation identity, independent from the browser read epoch. */
export class ForceEndIntent {
  private operation: { material: string; operationId: string } | null = null;
  reset() {
    this.operation = null;
  }
  submit(
    organizationId: string,
    shiftId: string,
    reason: string,
    confirmed: boolean,
  ) {
    const parsed = staffShiftForceEndReasonSchema.safeParse(reason);
    if (!confirmed || !parsed.success) return null;
    const material = JSON.stringify([
      organizationId,
      shiftId,
      parsed.data,
      "FORCE_END_SHIFT",
    ]);
    if (this.operation?.material !== material)
      this.operation = { material, operationId: crypto.randomUUID() };
    return {
      operationId: this.operation.operationId,
      reason: parsed.data,
      confirmation: "FORCE_END_SHIFT" as const,
    };
  }
  restore(
    organizationId: string,
    shiftId: string,
    reason: string,
    operationId: string,
  ) {
    this.operation = {
      material: JSON.stringify([
        organizationId,
        shiftId,
        reason,
        "FORCE_END_SHIFT",
      ]),
      operationId,
    };
  }
}
