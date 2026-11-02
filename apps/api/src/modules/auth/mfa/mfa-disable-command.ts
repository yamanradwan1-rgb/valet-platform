import { randomUUID } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import type {
  StaffMfaDisableRequest,
  StaffMfaDisableResponse,
} from "@valet/contracts";

import type { PostgresTransaction } from "../../../common/database/postgres";
import type { AntiAbuseReservation } from "../../anti-abuse/anti-abuse.service";
import { AntiAbuseUnavailableError } from "../../anti-abuse/anti-abuse.service";
import { appendAccountSecurityAuditEvent } from "../../audit/account-security-audit-writer";
import type { StaffSessionContext } from "../staff-session-context";
import type { MfaAntiAbuse } from "./mfa-anti-abuse";
import { MfaStateChangedError } from "./mfa-disable-errors";
import {
  lockDisableAccount,
  recheckDisableSession,
  tryMfaAdvisoryLock,
} from "./mfa-disable-locks";
import { MfaVerificationFailedError } from "./mfa-errors";
import { lockCurrentFactor } from "./mfa-factor-repository";
import { unprotectTotpSecret, verifyTotpCode } from "./mfa-totp";

export async function executeMfaDisable(
  tx: PostgresTransaction,
  context: StaffSessionContext,
  input: StaffMfaDisableRequest,
  reservation: AntiAbuseReservation,
  antiAbuse: MfaAntiAbuse,
): Promise<StaffMfaDisableResponse> {
  await lockDisableAccount(tx, context);
  // Never look up a supplied UUID as authority: current factor is derived from User.
  const factor = await lockCurrentFactor(tx, context.userId, { nowait: true });
  if (factor?.state !== "ACTIVE" || factor.id !== input.expectedFactorId)
    throw new MfaStateChangedError();
  const attempt = await tx.query(
    `SELECT id FROM anti_abuse_events WHERE id=$1 AND scope=$2 AND key_hash=$3
     AND state='PENDING' FOR UPDATE NOWAIT`,
    [reservation.id, reservation.key.scope, reservation.key.keyHash],
  );
  if (attempt.rowCount !== 1) throw new AntiAbuseUnavailableError();
  const eventId = randomUUID();
  await tryMfaAdvisoryLock(tx, eventId);
  const secret = unprotectTotpSecret(factor.protected_secret, {
    factorId: factor.id,
    userId: context.userId,
  });
  const previous = Number(factor.last_accepted_step);
  if (
    factor.last_accepted_step === null ||
    !Number.isSafeInteger(previous) ||
    previous < 0
  )
    throw new Error("Invalid MFA replay state.");
  const proofAt = await recheckDisableSession(tx, context);
  const verifyAt = (now: Date) =>
    verifyTotpCode({
      code: input.code,
      secret,
      now,
      lastAcceptedStep: previous,
    });
  let acceptedStep = await verifyAt(proofAt);
  if (acceptedStep === undefined) throw new MfaVerificationFailedError();
  const now = await recheckDisableSession(tx, context);
  if (
    Math.floor(now.getTime() / 1000) !== Math.floor(proofAt.getTime() / 1000)
  ) {
    acceptedStep = await verifyAt(now);
    if (acceptedStep === undefined) throw new MfaVerificationFailedError();
  }
  // All ownership, current policy, concurrency and fresh proof checks precede this write.
  const changed = await tx.query(
    `UPDATE user_mfa_totp_factors SET state='RETIRED',last_accepted_step=$3,retired_at=$4::timestamptz
     WHERE id=$1 AND user_id=$2 AND state='ACTIVE' AND last_accepted_step<$3
       AND EXISTS (SELECT 1 FROM staff_auth_sessions WHERE id=$5 AND user_id=$2
         AND current_access_token_hash=$6 AND revoked_at IS NULL
         AND clock_timestamp()<access_expires_at AND clock_timestamp()<absolute_expires_at)`,
    [
      factor.id,
      context.userId,
      acceptedStep,
      now,
      context.staffAuthSessionId,
      context.accessTokenHash,
    ],
  );
  if (changed.rowCount !== 1) throw new UnauthorizedException();
  await antiAbuse.successInTransaction(tx, reservation);
  await appendAccountSecurityAuditEvent(tx, {
    actor: { type: "USER", userId: context.userId },
    eventId,
    eventType: "MFA_TOTP_DISABLED",
    occurredAt: now,
    subjectUserId: context.userId,
  });
  return { state: "ENROLLMENT_REQUIRED" };
}
