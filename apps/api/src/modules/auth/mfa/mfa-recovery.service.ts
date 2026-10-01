import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { appendAccountSecurityAuditEvent } from "../../audit/account-security-audit-writer";
import type { PostgresPool } from "../../../common/database/postgres";
import { inPostgresTransaction } from "../../../common/database/postgres-transaction";
import { RUNTIME_POSTGRES_POOL } from "../../../common/database/runtime-database.module";
import {
  STAFF_SESSION_CONTEXT_RESOLVER,
  type StaffSessionContextResolver,
} from "../staff-session-context";
import { MfaAntiAbuse } from "./mfa-anti-abuse";
import { MfaVerificationFailedError } from "./mfa-errors";
import {
  insertPendingFactor,
  lockCurrentFactor,
  retireFactor,
} from "./mfa-factor-repository";
import {
  establishMfaAssurance,
  lockAndRecheckMfaSession,
  lockMfaUser,
  requireManagementMfaEligibility,
} from "./mfa-session-repository";
import {
  generateRecoveryCodes,
  recoveryCodeSelector,
  verifyRecoveryCodeVerifier,
} from "./mfa-recovery-code";
import { generateTotpSecret, verifyTotpCode } from "./mfa-totp";
import {
  protectTotpSecret,
  unprotectTotpSecret,
} from "./mfa-secret-protection";
import type { MfaProvisioningData } from "./mfa-enrollment.service";

interface RecoveryVerifierRow {
  readonly id: string;
  readonly verifier: string;
}

function priorStep(value: string | number | bigint | null): number | undefined {
  if (value === null) return undefined;
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new Error("MFA replay state is invalid.");
  }
  return converted;
}

@Injectable()
export class MfaRecoveryService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
    private readonly antiAbuse: MfaAntiAbuse,
  ) {}

  async beginSelfRecovery(
    authorization: string | undefined,
    recoveryCode: string,
  ): Promise<MfaProvisioningData> {
    const context = await this.sessions.resolve(authorization);
    const reservation = await this.antiAbuse.reserveRecovery(context.userId);
    try {
      return await inPostgresTransaction(this.pool, async (transaction) => {
        const session = await lockAndRecheckMfaSession(transaction, context);
        await lockMfaUser(transaction, session.user_id);
        await requireManagementMfaEligibility(transaction, session.user_id);
        const factor = await lockCurrentFactor(transaction, session.user_id);
        const selector = recoveryCodeSelector(recoveryCode);
        if (factor?.state !== "ACTIVE" || selector === undefined) {
          throw new MfaVerificationFailedError();
        }
        const codeResult = await transaction.query<RecoveryVerifierRow>(
          `SELECT id, verifier
           FROM mfa_recovery_codes
           WHERE factor_id = $1 AND set_generation = $2
             AND selector = $3 AND consumed_at IS NULL
           FOR UPDATE`,
          [factor.id, factor.recovery_set_generation, selector],
        );
        const stored = codeResult.rows[0];
        if (
          codeResult.rowCount !== 1 ||
          stored === undefined ||
          !verifyRecoveryCodeVerifier({
            factorId: factor.id,
            rawCode: recoveryCode,
            setGeneration: factor.recovery_set_generation,
            userId: factor.user_id,
            verifier: stored.verifier,
          })
        ) {
          throw new MfaVerificationFailedError();
        }
        const consumed = await transaction.query(
          `UPDATE mfa_recovery_codes SET consumed_at = $2::timestamptz
           WHERE id = $1 AND consumed_at IS NULL`,
          [stored.id, session.now],
        );
        if (consumed.rowCount !== 1) throw new MfaVerificationFailedError();
        await retireFactor(transaction, factor.id, session.now);
        const pendingFactorId = randomUUID();
        const secret = generateTotpSecret();
        await insertPendingFactor(transaction, {
          id: pendingFactorId,
          protectedSecret: protectTotpSecret(secret, {
            factorId: pendingFactorId,
            userId: session.user_id,
          }),
          userId: session.user_id,
        });
        await appendAccountSecurityAuditEvent(transaction, {
          actor: { type: "USER", userId: session.user_id },
          eventId: randomUUID(),
          eventType: "MFA_RECOVERY_CODE_USED",
          occurredAt: session.now,
          subjectUserId: session.user_id,
        });
        await appendAccountSecurityAuditEvent(transaction, {
          actor: { type: "USER", userId: session.user_id },
          eventId: randomUUID(),
          eventType: "MFA_FACTOR_REENROLLMENT_STARTED",
          occurredAt: session.now,
          subjectUserId: session.user_id,
        });
        await this.antiAbuse.successInTransaction(transaction, reservation);
        return {
          factorId: pendingFactorId,
          provisioning: {
            algorithm: "SHA1",
            digits: 6,
            issuer: "VAYLET",
            periodSeconds: 30,
            secretBase32: secret,
          },
        };
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

  async reissueRecoveryCodes(
    authorization: string | undefined,
    code: string,
  ): Promise<{
    readonly factorId: string;
    readonly recoveryCodes: readonly string[];
  }> {
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
          ...(priorStep(factor.last_accepted_step) === undefined
            ? {}
            : {
                lastAcceptedStep: priorStep(
                  factor.last_accepted_step,
                ) as number,
              }),
          now: session.now,
          secret,
        });
        if (acceptedStep === undefined) throw new MfaVerificationFailedError();
        const nextGeneration = factor.recovery_set_generation + 1;
        const recoveryCodes = generateRecoveryCodes({
          factorId: factor.id,
          setGeneration: nextGeneration,
          userId: factor.user_id,
        });
        for (let index = 0; index < recoveryCodes.length; index += 1) {
          const recovery = recoveryCodes[index];
          if (recovery === undefined)
            throw new Error("Recovery code generation failed.");
          await transaction.query(
            `INSERT INTO mfa_recovery_codes
               (id, factor_id, set_generation, slot, selector, verifier)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              randomUUID(),
              factor.id,
              nextGeneration,
              index + 1,
              recovery.selector,
              recovery.verifier,
            ],
          );
        }
        const updated = await transaction.query(
          `UPDATE user_mfa_totp_factors
           SET last_accepted_step = $2, recovery_set_generation = $3
           WHERE id = $1 AND state = 'ACTIVE'`,
          [factor.id, acceptedStep, nextGeneration],
        );
        if (updated.rowCount !== 1) throw new MfaVerificationFailedError();
        await establishMfaAssurance(
          transaction,
          session.id,
          factor.id,
          session.now,
        );
        await appendAccountSecurityAuditEvent(transaction, {
          actor: { type: "USER", userId: session.user_id },
          eventId: randomUUID(),
          eventType: "MFA_RECOVERY_CODES_REISSUED",
          occurredAt: session.now,
          subjectUserId: session.user_id,
        });
        await this.antiAbuse.successInTransaction(transaction, reservation);
        return {
          factorId: factor.id,
          recoveryCodes: recoveryCodes.map((entry) => entry.rawCode),
        };
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
