import type { PostgresTransaction } from "../../common/database/postgres";
import type { StaffSessionContext } from "./staff-session-context";
import { lockStaffUserSecurityBoundary } from "./staff-user-security-lock";

export interface LockedStaffSessionContext {
  readonly created_at: Date;
  readonly id: string;
  readonly user_id: string;
}

export async function lockAndRecheckStaffSessionContext(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<LockedStaffSessionContext | undefined> {
  await lockStaffUserSecurityBoundary(transaction, context.userId);
  const result = await transaction.query<LockedStaffSessionContext>(
    `SELECT session.id, session.user_id, session.created_at
     FROM staff_auth_sessions AS session
     INNER JOIN users AS staff_user ON staff_user.id = session.user_id
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.current_access_token_hash = $3
       AND session.created_at = $4::timestamptz
       AND session.revoked_at IS NULL
       AND clock_timestamp() < session.access_expires_at
       AND clock_timestamp() < session.absolute_expires_at
       AND staff_user.status = 'ACTIVE'
     FOR UPDATE OF session`,
    [
      context.staffAuthSessionId,
      context.userId,
      context.accessTokenHash,
      context.createdAt,
    ],
  );
  return result.rows[0];
}
