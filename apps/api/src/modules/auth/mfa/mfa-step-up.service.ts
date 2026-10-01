import { Inject, Injectable } from "@nestjs/common";

import type { PostgresPool } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../../common/database/runtime-database.module";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../staff-session-context";
import { MfaAntiAbuse } from "./mfa-anti-abuse";
import { MfaVerificationFailedError } from "./mfa-errors";
import { lockCurrentFactor } from "./mfa-factor-repository";
import {
  establishMfaAssurance,
  lockAndRecheckMfaSession,
  lockMfaUser,
  requireManagementMfaEligibility,
} from "./mfa-session-repository";
import { unprotectTotpSecret, verifyTotpCode } from "./mfa-totp";

function lastAcceptedStep(
  value: string | number | bigint | null,
): number | undefined {
  if (value === null) return undefined;
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new Error("MFA replay state is invalid.");
  }
  return converted;
}

@Injectable()
export class MfaStepUpService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
    private readonly antiAbuse: MfaAntiAbuse,
  ) {}

  async stepUp(
    authorization: string | undefined,
    code: string,
  ): Promise<{ readonly state: "ASSURED" }> {
    const context = await this.sessions.resolve(authorization);
    const reservation = await this.antiAbuse.reserveTotp(context.userId);
    try {
      return await inPostgresTransaction(this.pool, async (transaction) => {
        const session = await lockAndRecheckMfaSession(transaction, context);
        await lockMfaUser(transaction, session.user_id);
        await requireManagementMfaEligibility(transaction, session.user_id);
        const factor = await lockCurrentFactor(transaction, session.user_id);
        if (factor?.state !== "ACTIVE") throw new MfaVerificationFailedError();
        const secret = unprotectTotpSecret(factor.protected_secret, {
          factorId: factor.id,
          userId: factor.user_id,
        });
        const acceptedStep = await verifyTotpCode({
          code,
          ...(lastAcceptedStep(factor.last_accepted_step) === undefined
            ? {}
            : {
                lastAcceptedStep: lastAcceptedStep(
                  factor.last_accepted_step,
                ) as number,
              }),
          now: session.now,
          secret,
        });
        if (acceptedStep === undefined) throw new MfaVerificationFailedError();
        const updated = await transaction.query(
          `UPDATE user_mfa_totp_factors
           SET last_accepted_step = $2
           WHERE id = $1 AND state = 'ACTIVE'`,
          [factor.id, acceptedStep],
        );
        if (updated.rowCount !== 1) throw new MfaVerificationFailedError();
        await establishMfaAssurance(
          transaction,
          session.id,
          factor.id,
          session.now,
        );
        await this.antiAbuse.successInTransaction(transaction, reservation);
        return { state: "ASSURED" };
      });
    } catch (error) {
      if (error instanceof MfaVerificationFailedError) {
        await this.antiAbuse.failure(reservation);
      } else {
        await this.antiAbuse.success(reservation);
      }
      throw error;
    }
  }
}
