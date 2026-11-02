import { UnauthorizedException } from "@nestjs/common";
import type { PostgresTransaction } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../staff-session-context";
import {
  MfaDisableNotAllowedError,
  MfaOperationBusyError,
} from "./mfa-disable-errors";

export async function tryMfaAdvisoryLock(
  tx: PostgresTransaction,
  key: string,
): Promise<void> {
  const result = await tx.query<{ acquired: boolean }>(
    `SELECT pg_try_advisory_xact_lock(hashtextextended($1::text,0)) AS acquired`,
    [key],
  );
  if (result.rows[0]?.acquired !== true) throw new MfaOperationBusyError();
}

export async function recheckDisableSession(
  tx: PostgresTransaction,
  context: StaffSessionContext,
): Promise<Date> {
  const result = await tx.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now FROM staff_auth_sessions
     WHERE id=$1 AND user_id=$2 AND current_access_token_hash=$3
       AND created_at=$4::timestamptz AND revoked_at IS NULL
       AND clock_timestamp()<access_expires_at AND clock_timestamp()<absolute_expires_at`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      context.createdAt,
    ],
  );
  const now = result.rows[0]?.now;
  if (result.rowCount !== 1 || !now) throw new UnauthorizedException();
  return now;
}

export async function lockDisableAccount(
  tx: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  await tryMfaAdvisoryLock(tx, `staff-user-security:${context.userId}`);
  const user = await tx.query<{ status: string }>(
    `SELECT status FROM users WHERE id=$1 FOR UPDATE NOWAIT`,
    [context.userId],
  );
  if (user.rows[0]?.status !== "ACTIVE") throw new UnauthorizedException();
  const session = await tx.query(
    `SELECT id FROM staff_auth_sessions WHERE id=$1 AND user_id=$2
       AND current_access_token_hash=$3 AND created_at=$4::timestamptz
       AND revoked_at IS NULL AND clock_timestamp()<access_expires_at
       AND clock_timestamp()<absolute_expires_at FOR UPDATE NOWAIT`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      context.createdAt,
    ],
  );
  if (session.rowCount !== 1) throw new UnauthorizedException();
  await tryMfaAdvisoryLock(tx, `mfa-user:${context.userId}`);
  // User UPDATE also excludes inserts/reparenting via the immediate membership FK.
  const members = await tx.query<{
    organization_id: string;
    role: string;
    status: string;
  }>(
    `SELECT id,organization_id,role,status FROM organization_memberships
     WHERE user_id=$1 ORDER BY id FOR SHARE NOWAIT`,
    [context.userId],
  );
  const organizations = await tx.query<{ id: string; status: string }>(
    `SELECT id,status FROM organizations WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE NOWAIT`,
    [[...new Set(members.rows.map((row) => row.organization_id))]],
  );
  const active = new Set(
    organizations.rows
      .filter((row) => row.status === "ACTIVE")
      .map((row) => row.id),
  );
  if (
    members.rows.some(
      (row) =>
        row.role === "ORG_ADMIN" &&
        row.status === "ACTIVE" &&
        active.has(row.organization_id),
    )
  ) {
    throw new MfaDisableNotAllowedError();
  }
}
