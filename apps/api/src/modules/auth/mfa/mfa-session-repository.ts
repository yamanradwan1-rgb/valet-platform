import { UnauthorizedException } from "@nestjs/common";

import type {
  PostgresPool,
  PostgresTransaction,
} from "../../../common/database/postgres";
import type { StaffSessionContext } from "../staff-session-context";
import { accessTokenPattern } from "../staff-auth-credential";
import { lockStaffSessionWithBearer } from "../staff-session-lock";
import { lockStaffUserSecurityBoundary } from "../staff-user-security-lock";
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
  transaction: Pick<PostgresPool, "query"> | PostgresTransaction,
  context: StaffSessionContext,
): Promise<LockedMfaSession> {
  const session = await lockStaffSessionWithBearer(
    transaction,
    context,
    "EXCLUSIVE",
  );
  if (session === undefined) throw new UnauthorizedException();
  return {
    id: session.id,
    user_id: session.user_id,
    absolute_expires_at: session.absolute_expires_at,
    mfa_authenticated_at: session.mfa_authenticated_at,
    mfa_factor_id: session.mfa_factor_id,
    last_admin_activity_at: session.last_admin_activity_at,
    now: session.checked_at,
  };
}

interface MfaWriterSessionRow extends Omit<LockedMfaSession, "now"> {
  readonly access_expires_at: Date;
}

/** Use only with MFA_CEREMONY_POSTGRES_POOL's dedicated writer connection. */
export async function lockAndRecheckMfaSessionInWriter(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<LockedMfaSession> {
  const bearer = context.rawAccessToken;
  if (bearer === undefined || !accessTokenPattern.test(bearer)) {
    throw new UnauthorizedException();
  }
  await lockStaffUserSecurityBoundary(transaction, context.userId);
  const result = await transaction.query<MfaWriterSessionRow>(
    `SELECT session.id, session.user_id, session.absolute_expires_at,
            session.mfa_authenticated_at, session.mfa_factor_id,
            session.last_admin_activity_at, session.access_expires_at
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id = session.user_id
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.created_at = $4::timestamptz
       AND session.current_access_token_hash =
           'staff-access-sha256:v1:' || pg_catalog.encode(
             pg_catalog.sha256(pg_catalog.convert_to($3::text, 'UTF8')), 'hex'
           )
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
       AND staff_user.status = 'ACTIVE'
     FOR UPDATE OF session, staff_user`,
    [context.staffAuthSessionId, context.userId, bearer, context.createdAt],
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new UnauthorizedException();
  }
  const clock = await transaction.query<{ readonly now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const now = clock.rows[0]?.now;
  if (
    now === undefined ||
    now >= row.access_expires_at ||
    now >= row.absolute_expires_at
  ) {
    throw new UnauthorizedException();
  }
  return {
    id: row.id,
    user_id: row.user_id,
    absolute_expires_at: row.absolute_expires_at,
    mfa_authenticated_at: row.mfa_authenticated_at,
    mfa_factor_id: row.mfa_factor_id,
    last_admin_activity_at: row.last_admin_activity_at,
    now,
  };
}

export async function requireManagementMfaEligibility(
  transaction: PostgresTransaction,
  userId: string,
): Promise<void> {
  const result = await transaction.query(
    `SELECT membership.id
     FROM organization_memberships AS membership
     INNER JOIN organizations AS organization
       ON organization.id = membership.organization_id
     WHERE membership.user_id = $1
       AND membership.role IN ('ORG_ADMIN', 'LOCATION_MANAGER')
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
