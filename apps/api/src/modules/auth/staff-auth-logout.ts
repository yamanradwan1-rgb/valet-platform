import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  refreshTokenPattern,
  staffCredentialHash,
} from "./staff-auth-credential";
import { revokeStaffSessionAndDisablePush } from "./staff-session-revocation";

export async function logoutStaffSession(
  pool: PostgresPool,
  refreshToken: string | undefined,
): Promise<void> {
  if (refreshToken === undefined || !refreshTokenPattern.test(refreshToken))
    return;
  await inPostgresTransaction(pool, async (transaction) => {
    const locked = await transaction.query<{ session_id: string }>(
      `SELECT refresh.session_id
       FROM staff_refresh_credentials AS refresh
       INNER JOIN staff_auth_sessions AS session ON session.id = refresh.session_id
       WHERE refresh.token_hash = $1
       FOR UPDATE OF refresh, session`,
      [staffCredentialHash("refresh", refreshToken)],
    );
    const sessionId = locked.rows[0]?.session_id;
    if (sessionId !== undefined) {
      await revokeStaffSessionAndDisablePush(transaction, sessionId);
    }
  });
}
