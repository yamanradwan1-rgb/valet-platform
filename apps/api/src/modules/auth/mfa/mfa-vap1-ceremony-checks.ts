import type { MfaFactorRow } from "./mfa-factor-repository";
import type { LockedMfaSession } from "./mfa-session-repository";
import { verifyRecoveryCodeVerifier } from "./mfa-recovery-code";
import { unprotectTotpSecret } from "./mfa-secret-protection";
import { verifyTotpCode } from "./mfa-totp";

/**
 * These are purpose-specific checks of the *submitted* human ceremony inside
 * an already locked MFA transaction. They issue NO token, proof, signature or
 * authorization object. SQL/session/context facts alone cannot call a signer;
 * a future VAP1 issuer also needs the protected state/admission challenge.
 * Never accept VAYLET_LOCAL_DISABLE_MFA as a ceremony substitute.
 */
function isSameLockedOwner(
  session: LockedMfaSession,
  factor: MfaFactorRow,
): boolean {
  return factor.user_id === session.user_id;
}

function acceptedPriorStep(
  value: string | number | bigint | null,
): number | undefined {
  if (value === null) return undefined;
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new Error("MFA replay state is invalid.");
  }
  return converted;
}

async function verifyLockedTotp(
  submittedCode: string,
  session: LockedMfaSession,
  factor: MfaFactorRow,
  lastAcceptedStep?: number,
): Promise<number | undefined> {
  if (!isSameLockedOwner(session, factor)) return undefined;
  const secret = unprotectTotpSecret(factor.protected_secret, {
    factorId: factor.id,
    userId: factor.user_id,
  });
  return verifyTotpCode({
    code: submittedCode,
    now: session.now,
    secret,
    ...(lastAcceptedStep === undefined ? {} : { lastAcceptedStep }),
  });
}

/** A05: initiating session and still-PENDING factor, not accepted step alone. */
export function verifyLockedEnrollmentConfirmation(
  submittedCode: string,
  session: LockedMfaSession,
  factor: MfaFactorRow,
): Promise<number | undefined> {
  if (
    factor.state !== "PENDING" ||
    factor.pending_enrollment_session_id !== session.id
  ) {
    return Promise.resolve(undefined);
  }
  return verifyLockedTotp(submittedCode, session, factor);
}

/** A06: TOTP against current ACTIVE factor + recorded replay lower bound. */
export function verifyLockedMfaStepUp(
  submittedCode: string,
  session: LockedMfaSession,
  factor: MfaFactorRow,
): Promise<number | undefined> {
  if (factor.state !== "ACTIVE") return Promise.resolve(undefined);
  return verifyLockedTotp(
    submittedCode,
    session,
    factor,
    acceptedPriorStep(factor.last_accepted_step),
  );
}

/** A08: reissue has a *new real TOTP* requirement, not a stored assurance flag. */
export function verifyLockedRecoveryReissue(
  submittedCode: string,
  session: LockedMfaSession,
  factor: MfaFactorRow,
): Promise<number | undefined> {
  return verifyLockedMfaStepUp(submittedCode, session, factor);
}

/** A07: actual unconsumed raw code verified for locked factor + generation. */
export function verifyLockedSelfRecoveryCode(input: {
  readonly submittedCode: string;
  readonly session: LockedMfaSession;
  readonly factor: MfaFactorRow;
  readonly storedVerifier: string;
}): boolean {
  const { submittedCode, session, factor, storedVerifier } = input;
  if (factor.state !== "ACTIVE" || !isSameLockedOwner(session, factor))
    return false;
  return verifyRecoveryCodeVerifier({
    rawCode: submittedCode,
    userId: factor.user_id,
    factorId: factor.id,
    setGeneration: factor.recovery_set_generation,
    verifier: storedVerifier,
  });
}
