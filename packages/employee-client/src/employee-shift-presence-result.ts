import { endShiftResponseSchema } from "@valet/contracts";
import { validateEmployeeShiftEndResult } from "./employee-shift-end-state";
import type {
  PresenceResult,
  PresenceTarget,
} from "./employee-shift-presence-types";
import { presenceFailure } from "./employee-shift-presence-workflow";

/** Validate before deleting the sole durable recovery selector. */
export function validatePresenceResult(
  target: PresenceTarget,
  result: PresenceResult,
): void {
  if (
    result.locationId !== target.locationId ||
    (target.action === "START" && result.status !== "ACTIVE") ||
    (target.action === "END" &&
      (result.shiftId !== target.shiftId || result.status !== "ENDED"))
  )
    throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
  if (target.action !== "END") return;
  const parsed = endShiftResponseSchema.safeParse(result);
  if (!parsed.success) throw presenceFailure("PRESENCE_RESPONSE_MISMATCH");
  // Legacy in-memory callers lack these fields; persisted Native END targets require them.
  if (target.shiftStartedAt === undefined || target.currency === undefined)
    return;
  validateEmployeeShiftEndResult(
    {
      shiftId: target.shiftId!,
      locationId: target.locationId,
      shiftStartedAt: target.shiftStartedAt,
      currency: target.currency,
    },
    target.cashReported!,
    parsed.data,
  );
}
