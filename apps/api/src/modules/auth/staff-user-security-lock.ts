import type { PostgresTransaction } from "../../common/database/postgres";

interface LoginSecurityRow {
  readonly password_hash: string | null;
  readonly status: "PENDING" | "ACTIVE" | "DISABLED";
}

export function lockStaffUserSecurityBoundary(
  transaction: PostgresTransaction,
  userId: string,
): Promise<unknown> {
  return transaction.query(
    `SELECT pg_advisory_xact_lock(
       hashtextextended('staff-user-security:' || $1::text, 0)
     )`,
    [userId],
  );
}

export async function lockAndRecheckStaffLoginUser(
  transaction: PostgresTransaction,
  userId: string,
  passwordHash: string,
): Promise<boolean> {
  await lockStaffUserSecurityBoundary(transaction, userId);
  const result = await transaction.query<LoginSecurityRow>(
    `SELECT password_hash, status FROM users WHERE id = $1 FOR UPDATE`,
    [userId],
  );
  const current = result.rows[0];
  return current?.status === "ACTIVE" && current.password_hash === passwordHash;
}

export async function lockStaffRefreshUserSecurityBoundary(
  transaction: PostgresTransaction,
  refreshHash: string,
): Promise<boolean> {
  const owner = await transaction.query<{ readonly user_id: string }>(
    `SELECT session.user_id
     FROM staff_refresh_credentials AS refresh
     INNER JOIN staff_auth_sessions AS session ON session.id = refresh.session_id
     WHERE refresh.token_hash = $1`,
    [refreshHash],
  );
  const userId = owner.rows[0]?.user_id;
  if (userId === undefined) return false;
  await lockStaffUserSecurityBoundary(transaction, userId);
  return true;
}
