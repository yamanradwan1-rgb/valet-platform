import { UnauthorizedException } from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import { requireRequestBearerPossession } from "../auth/staff-auth-vap1-bearer";
import type { StaffSessionContextResolver } from "../auth/staff-session-context";
import { preflightPasswordResetTarget } from "./issue416-password-reset-authority";
import type { ProtectedResetCaller } from "./issue416-password-reset-boundary";

/**
 * Preflight of the actual submitted vsa1 credential, current sensitive MFA,
 * Company Admin entitlement and the sole-company ACTIVE target. The private
 * R01/R02 writer must lock/revalidate all facts before its protected command.
 */
export async function resolveIssue416ResetCaller(
  pool: PostgresPool,
  sessions: StaffSessionContextResolver,
  authorization: string | undefined,
  organizationId: string,
  membershipId: string,
): Promise<ProtectedResetCaller> {
  if (authorization === undefined) throw new UnauthorizedException();
  const context = await sessions.resolve(authorization);
  requireRequestBearerPossession(authorization, context);
  const targetUserId = await inPostgresTransaction(pool, (transaction) =>
    preflightPasswordResetTarget(
      transaction,
      context,
      organizationId,
      membershipId,
    ),
  );
  return {
    authorization,
    context,
    organizationId,
    membershipId,
    targetUserId,
  };
}
