import { UnauthorizedException } from "@nestjs/common";

import type { PostgresTransaction } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../staff-session-context";
import { MfaEnrollmentNotAvailableError } from "./mfa-errors";

export interface LockedMfaSession {
  readonly absolute_expires_at: Date;
  readonly id: string;
  readonly last_admin_activity_at: Date | null;
  readonly mfa_authenticated_at: Date | null;
  readonly mfa_factor_id: string | null;
  readonly now: Date;
  readonly user_id: string;
}

export async function lockAndRecheckMfaSession(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<LockedMfaSession> {
  const result = await transaction.query<LockedMfaSession>(
    `SELECT session.id, session.user_id, session.absolute_expires_at,
            session.mfa_authenticated_at, session.mfa_factor_id,
            session.last_admin_activity_at, clock_timestamp() AS now
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id = session.user_id
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
       AND staff_user.status = 'ACTIVE'
     FOR UPDATE OF session, staff_user`,
    [context.staffAuthSessionId, context.userId, context.accessTokenHash],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new UnauthorizedException();
  }
  return row;
}

export async function requireCompanyAdminEligibility(
  transaction: PostgresTransaction,
  userId: string,
): Promise<void> {
  const result = await transaction.query(
    `SELECT membership.id
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
     WHERE membership.user_id = $1
       AND membership.role = 'ORG_ADMIN'
       AND membership.status = 'ACTIVE'
       AND organization.status = 'ACTIVE'
     ORDER BY membership.id
     LIMIT 1`,
    [userId],
  );
  if (result.rowCount !== 1) throw new MfaEnrollmentNotAvailableError();
}

export async function lockMfaUser(
  transaction: PostgresTransaction,
  userId: string,
): Promise<void> {
  await transaction.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('mfa-user:' || $1::text, 0))`,
    [userId],
  );
}

export async function establishMfaAssurance(
  transaction: PostgresTransaction,
  sessionId: string,
  factorId: string,
  now: Date,
): Promise<void> {
  const updated = await transaction.query(
    `UPDATE staff_auth_sessions
     SET mfa_authenticated_at = $3::timestamptz,
         mfa_factor_id = $2,
         last_admin_activity_at = $3::timestamptz
     WHERE id = $1
       AND revoked_at IS NULL
       AND $3::timestamptz < access_expires_at
       AND $3::timestamptz < absolute_expires_at`,
    [sessionId, factorId, now],
  );
  if (updated.rowCount !== 1) throw new UnauthorizedException();
}
