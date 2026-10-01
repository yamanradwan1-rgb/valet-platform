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
import {
  MfaEnrollmentNotAvailableError,
  MfaVerificationFailedError,
} from "./mfa-errors";
import {
  insertPendingFactor,
  lockCurrentFactor,
  lockFactorById,
} from "./mfa-factor-repository";
import {
  establishMfaAssurance,
  lockAndRecheckMfaSession,
  lockMfaUser,
  requireManagementMfaEligibility,
} from "./mfa-session-repository";
import {
  protectTotpSecret,
  unprotectTotpSecret,
} from "./mfa-secret-protection";
import { generateTotpSecret, verifyTotpCode } from "./mfa-totp";
import { generateRecoveryCodes } from "./mfa-recovery-code";

export interface MfaProvisioningData {
  readonly factorId: string;
  readonly provisioning: {
    readonly algorithm: "SHA1";
    readonly digits: 6;
    readonly issuer: "VAYLET";
    readonly periodSeconds: 30;
    readonly secretBase32: string;
  };
}

export interface MfaEnrollmentConfirmation {
  readonly recoveryCodes: readonly string[];
}

@Injectable()
export class MfaEnrollmentService {
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
    @Inject(STAFF_SESSION_CONTEXT_RESOLVER)
    private readonly sessions: StaffSessionContextResolver,
    private readonly antiAbuse: MfaAntiAbuse,
  ) {}

  async begin(authorization: string | undefined): Promise<MfaProvisioningData> {
    const context = await this.sessions.resolve(authorization);
    return inPostgresTransaction(this.pool, async (transaction) => {
      const session = await lockAndRecheckMfaSession(transaction, context);
      await lockMfaUser(transaction, session.user_id);
      await requireManagementMfaEligibility(transaction, session.user_id);
      const current = await lockCurrentFactor(transaction, session.user_id);
      if (current?.state === "ACTIVE")
        throw new MfaEnrollmentNotAvailableError();
      if (current?.state === "PENDING") {
        return this.provisioning(
          current.id,
          unprotectTotpSecret(current.protected_secret, {
            factorId: current.id,
            userId: current.user_id,
          }),
        );
      }
      const factorId = randomUUID();
      const secret = generateTotpSecret();
      const protectedSecret = protectTotpSecret(secret, {
        factorId,
        userId: session.user_id,
      });
      await insertPendingFactor(transaction, {
        id: factorId,
        protectedSecret,
        userId: session.user_id,
      });
      return this.provisioning(factorId, secret);
    });
  }

  async confirm(
    authorization: string | undefined,
    input: { readonly code: string; readonly factorId: string },
  ): Promise<MfaEnrollmentConfirmation> {
    const context = await this.sessions.resolve(authorization);
    const reservation = await this.antiAbuse.reserveTotp(context.userId);
    try {
      return await inPostgresTransaction(this.pool, async (transaction) => {
        const session = await lockAndRecheckMfaSession(transaction, context);
        await lockMfaUser(transaction, session.user_id);
        await requireManagementMfaEligibility(transaction, session.user_id);
        const factor = await lockFactorById(
          transaction,
          session.user_id,
          input.factorId,
        );
        if (factor?.state !== "PENDING") {
          throw new MfaEnrollmentNotAvailableError();
        }
        const secret = unprotectTotpSecret(factor.protected_secret, {
          factorId: factor.id,
          userId: factor.user_id,
        });
        const acceptedStep = await verifyTotpCode({
          code: input.code,
          now: session.now,
          secret,
        });
        if (acceptedStep === undefined) throw new MfaVerificationFailedError();
        const recoverySetGeneration = 1;
        const recoveryCodes = generateRecoveryCodes({
          factorId: factor.id,
          setGeneration: recoverySetGeneration,
          userId: factor.user_id,
        });
        const activated = await transaction.query(
          `UPDATE user_mfa_totp_factors
           SET state = 'ACTIVE', activated_at = $2::timestamptz,
               last_accepted_step = $3, recovery_set_generation = $4
           WHERE id = $1 AND state = 'PENDING'`,
          [factor.id, session.now, acceptedStep, recoverySetGeneration],
        );
        if (activated.rowCount !== 1)
          throw new MfaEnrollmentNotAvailableError();
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
              recoverySetGeneration,
              index + 1,
              recovery.selector,
              recovery.verifier,
            ],
          );
        }
        await establishMfaAssurance(
          transaction,
          session.id,
          factor.id,
          session.now,
        );
        await appendAccountSecurityAuditEvent(transaction, {
          actor: { type: "USER", userId: session.user_id },
          eventId: randomUUID(),
          eventType: "MFA_TOTP_ACTIVATED",
          occurredAt: session.now,
          subjectUserId: session.user_id,
        });
        await this.antiAbuse.successInTransaction(transaction, reservation);
        return {
          recoveryCodes: recoveryCodes.map((code) => code.rawCode),
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

  private provisioning(
    factorId: string,
    secretBase32: string,
  ): MfaProvisioningData {
    return {
      factorId,
      provisioning: {
        algorithm: "SHA1",
        digits: 6,
        issuer: "VAYLET",
        periodSeconds: 30,
        secretBase32,
      },
    };
  }
}
