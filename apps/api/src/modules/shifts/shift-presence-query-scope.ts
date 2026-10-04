import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { requireActiveShiftUser } from "./shift-authorization";
import { ShiftOperationError } from "./shift-errors";
import { authorizePresenceOperationalScope } from "./shift-presence-operational-scope";

export async function authorizePresenceResultScope(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  row: {
    readonly user_id: string;
    readonly organization_id: string;
    readonly location_id: string;
    readonly membership_id: string;
    readonly action: "START" | "END";
    readonly shift_id: string | null;
    readonly status: string;
    readonly denial_reason?: string | null;
    readonly expiry_cause?: string | null;
  },
) {
  try {
    return await authorizePresenceOperationalScope(
      transaction,
      context,
      row.action === "START"
        ? { action: "START", targetLocationId: row.location_id }
        : { action: "END", shiftId: row.shift_id! },
    );
  } catch (error) {
    const ownedRevocation =
      (row.status === "DENIED" &&
        row.denial_reason === "APPROVER_AUTHORITY_REVOKED") ||
      (row.status === "EXPIRED" &&
        row.expiry_cause === "APPROVER_AUTHORITY_REVOKED");
    if (
      !(error instanceof ShiftOperationError) ||
      !ownedRevocation ||
      row.user_id !== context.userId
    )
      throw error;
    await requireActiveShiftUser(transaction, context.userId);
    const owner = await transaction.query(
      `SELECT id FROM organization_memberships WHERE id=$1 AND organization_id=$2 AND user_id=$3 FOR SHARE`,
      [row.membership_id, row.organization_id, context.userId],
    );
    if (owner.rowCount !== 1) throw error;
    // Only the persisted owned denial is readable; this proof never authorizes an action.
    return {
      membershipId: row.membership_id,
      organizationId: row.organization_id,
      locationId: row.location_id,
    };
  }
}
