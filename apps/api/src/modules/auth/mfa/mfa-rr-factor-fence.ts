import type { PostgresTransaction } from "../../../common/database/postgres";
import type { StaffSessionContext } from "../staff-session-context";
import { MfaStepUpRequiredError } from "./mfa-errors";
import { localMfaBypassEnabled } from "./local-mfa-bypass";

/**
 * Call only AFTER canonical Company Admin session/User and Organization locks
 * have been acquired, and BEFORE the protected RR projection. A recovery
 * UPDATE is serialized by the session/User locks acquired before this fence.
 * The factor is read after those locks, so Runtime needs no factor UPDATE
 * privilege merely to take a row lock.
 */
export async function requireCurrentMfaFactorFenceInRr(
  transaction: PostgresTransaction,
  context: StaffSessionContext,
): Promise<void> {
  if (localMfaBypassEnabled()) return;
  const factor = await transaction.query(
    `SELECT factor.id
     FROM staff_auth_sessions AS session
     INNER JOIN user_mfa_totp_factors AS factor
       ON factor.id = session.mfa_factor_id
      AND factor.user_id = session.user_id
     WHERE session.id = $1
       AND session.user_id = $2
       AND session.created_at = $3::timestamptz
       AND factor.state = 'ACTIVE'`,
    [context.staffAuthSessionId, context.userId, context.createdAt],
  );
  if (factor.rowCount !== 1) throw new MfaStepUpRequiredError();
}
