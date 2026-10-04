import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import { guardPresenceShiftIntent } from "./shift-presence-security";
import {
  authorizeShiftStart,
  requireActiveShiftUser,
} from "./shift-authorization";
import { ShiftOperationError } from "./shift-errors";

/** Safe own-End is intentionally distinct from Start operational eligibility. */
export async function authorizePresenceOperationalScope(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  intent:
    | { action: "START"; targetLocationId: string }
    | { action: "END"; shiftId: string },
) {
  await guardPresenceShiftIntent(transaction, {
    authenticatedUserId: context.userId,
    sessionContext: context,
    protectExceptionAuthority: true,
    ...(intent.action === "START"
      ? { targetLocationId: intent.targetLocationId }
      : { shiftId: intent.shiftId }),
  });
  if (intent.action === "START") {
    return {
      ...(await authorizeShiftStart(transaction, {
        authenticatedUserId: context.userId,
        targetLocationId: intent.targetLocationId,
      })),
      userId: context.userId,
    };
  }
  await requireActiveShiftUser(transaction, context.userId);
  const owned = await transaction.query<{
    organizationId: string;
    locationId: string;
    membershipId: string;
    currency: string;
    status: string;
  }>(
    `SELECT s.organization_id::text AS "organizationId",s.location_id::text AS "locationId",s.membership_id::text AS "membershipId",l.currency,s.status::text
     FROM shifts s JOIN organization_memberships m ON m.id=s.membership_id AND m.organization_id=s.organization_id
     JOIN locations l ON l.id=s.location_id AND l.organization_id=s.organization_id
     WHERE s.id=$1 AND m.user_id=$2 AND m.role IN ('VALET_EMPLOYEE','VALET_SUPERVISOR') FOR SHARE OF m,l,s`,
    [intent.shiftId, context.userId],
  );
  if (owned.rows[0] === undefined)
    throw new ShiftOperationError("TENANT_ACCESS_DENIED");
  return { ...owned.rows[0], userId: context.userId };
}
