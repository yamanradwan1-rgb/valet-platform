import type { PostgresTransaction } from "../../common/database/postgres";

export async function revokeStaffSessionAndDisablePush(
  transaction: PostgresTransaction,
  sessionId: string,
): Promise<void> {
  const clock = await transaction.query<{ now: Date }>(
    `SELECT clock_timestamp() AS now`,
  );
  const now = clock.rows[0]?.now;
  if (now === undefined)
    throw new Error("Session revocation clock unavailable.");
  await transaction.query(
    `UPDATE staff_auth_sessions
     SET revoked_at = COALESCE(revoked_at, $2::timestamptz)
     WHERE id = $1`,
    [sessionId, now],
  );
  await transaction.query(
    `UPDATE staff_push_registrations
     SET state = 'DISABLED', provider_token = NULL,
         terminal_at = $2::timestamptz,
         terminal_reason_class = 'SESSION_LOGOUT',
         updated_at = $2::timestamptz
     WHERE staff_auth_session_id = $1 AND state = 'ACTIVE'`,
    [sessionId, now],
  );
}
