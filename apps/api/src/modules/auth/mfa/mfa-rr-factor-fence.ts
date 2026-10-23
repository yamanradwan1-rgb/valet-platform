import type { PostgresTransaction } from '../../../common/database/postgres';
import type { StaffSessionContext } from '../staff-session-context';
import { MfaStepUpRequiredError } from './mfa-errors';
import { localMfaBypassEnabled } from './local-mfa-bypass';

/**
 * Call only AFTER canonical Company Admin session/User and Organization locks
 * have been acquired, and BEFORE the protected RR projection. A recovery
 * UPDATE committed after the RR snapshot causes PostgreSQL 40001 here, so the
 * owner must retry the entire transaction with fresh authorization. Holding
 * FOR SHARE through COMMIT orders reader-first recovery correctly.
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
       AND session.current_access_token_hash = $3
       AND factor.state = 'ACTIVE'
     FOR SHARE OF factor`,
    [context.staffAuthSessionId, context.userId, context.accessTokenHash],
  );
  if (factor.rowCount !== 1) throw new MfaStepUpRequiredError();
}
