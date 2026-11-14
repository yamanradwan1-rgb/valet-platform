import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "../auth/staff-session-context";
import {
  authorizeCompanyAdminManagement,
  ManagementAccessDeniedError,
} from "./management-authorization";

/**
 * Non-authoritative, read-only preflight. The future protected SQL writer MUST
 * repeat every check under its own verified bearer, lock and MFA ceremony.
 * This read cannot prevent concurrent status/role/membership changes.
 */
export async function preflightPasswordResetTarget(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
  organizationId: string,
  membershipId: string,
  sensitive: boolean,
): Promise<string> {
  await authorizeCompanyAdminManagement(transaction, context, {
    organizationId,
    capability: "STAFF_MANAGE_ELIGIBLE",
    assurance: sensitive ? "SENSITIVE" : "STANDARD",
  });
  const candidate = await transaction.query<{ readonly targetUserId: string }>(
    `SELECT target.user_id::text AS "targetUserId"
     FROM organization_memberships AS target
     INNER JOIN users AS staff_user
       ON staff_user.id = target.user_id AND staff_user.status = 'ACTIVE'
     WHERE target.id = $1
       AND target.organization_id = $2
       AND target.status = 'ACTIVE'
       AND target.role IN
         ('LOCATION_MANAGER', 'VALET_SUPERVISOR', 'VALET_EMPLOYEE')
       AND target.user_id <> $3
       AND (
         SELECT COUNT(*) FROM organization_memberships AS all_memberships
         WHERE all_memberships.user_id = target.user_id
       ) = 1`,
    [membershipId, organizationId, context.userId],
  );
  const targetUserId = candidate.rows[0]?.targetUserId;
  if (candidate.rowCount !== 1 || targetUserId === undefined) {
    throw new ManagementAccessDeniedError();
  }
  return targetUserId;
}
