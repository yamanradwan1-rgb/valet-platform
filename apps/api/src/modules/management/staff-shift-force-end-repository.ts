import type {
  StaffShiftForceEndRequest,
  StaffShiftForceEndResult,
} from "@valet/contracts";
import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { throwStaffShiftForceEndDatabaseError } from "./staff-shift-force-end-errors";
import { staffShiftForceEndFingerprint } from "./staff-shift-force-end-policy";

interface ClosureRow {
  readonly operation_id: string;
  readonly shift_id: string;
  readonly membership_id: string;
  readonly location_id: string;
  readonly started_at: Date;
  readonly ended_at: Date;
}

export async function forceEndStaffShift(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  shiftId: string,
  command: StaffShiftForceEndRequest,
): Promise<StaffShiftForceEndResult> {
  try {
    const result = await transaction.query<ClosureRow>(
      `SELECT * FROM public.staff_shift_force_end(
        $1::uuid,$2::uuid,$3::text,$4::uuid,$5::uuid,$6::uuid,
        $7::text,$8::text,$9::text
      )`,
      [
        context.userId,
        context.staffAuthSessionId,
        context.accessTokenHash,
        organizationId,
        shiftId,
        command.operationId,
        staffShiftForceEndFingerprint(organizationId, shiftId, command),
        command.confirmation,
        command.reason,
      ],
    );
    const row = result.rows[0];
    if (row === undefined || result.rowCount !== 1)
      throw new Error("Shift closure result is unavailable.");
    return {
      operationId: row.operation_id,
      shiftId: row.shift_id,
      membershipId: row.membership_id,
      locationId: row.location_id,
      status: "ENDED",
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at.toISOString(),
      closureKind: "ADMIN_FORCE_END",
      cashReconciliationState: "PENDING",
    };
  } catch (error) {
    return throwStaffShiftForceEndDatabaseError(error);
  }
}
