import type { StaffMfaDisableAvailability } from "@valet/contracts";
import { UnauthorizedException } from "@nestjs/common";

import type { PostgresPool } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../staff-session-context";

export async function readMfaDisableAvailability(
  pool: PostgresPool,
  context: StaffSessionContext,
): Promise<StaffMfaDisableAvailability> {
  // One statement snapshot, no locks, writes, activity renewal or attempt reservation.
  const result = await pool.query<{
    factor_id: string | null;
    mandatory: boolean;
  }>(
    `SELECT factor.id AS factor_id, EXISTS (
       SELECT 1 FROM organization_memberships AS membership
       JOIN organizations AS organization ON organization.id=membership.organization_id
       WHERE membership.user_id=staff_user.id AND membership.role='ORG_ADMIN'
         AND membership.status='ACTIVE' AND organization.status='ACTIVE'
     ) AS mandatory
     FROM staff_auth_sessions AS session
     JOIN users AS staff_user ON staff_user.id=session.user_id
     LEFT JOIN user_mfa_totp_factors AS factor
       ON factor.user_id=staff_user.id AND factor.state='ACTIVE'
     WHERE session.id=$1 AND session.user_id=$2 AND session.current_access_token_hash=$3
       AND session.created_at=$4::timestamptz AND session.revoked_at IS NULL
       AND clock_timestamp()<session.access_expires_at
       AND clock_timestamp()<session.absolute_expires_at AND staff_user.status='ACTIVE'`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      context.createdAt,
    ],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || !row) throw new UnauthorizedException();
  if (row.mandatory) return { availability: "MFA_REQUIRED_BY_POLICY" };
  return row.factor_id === null
    ? { availability: "MFA_NOT_ENABLED" }
    : { availability: "AVAILABLE", expectedFactorId: row.factor_id };
}
