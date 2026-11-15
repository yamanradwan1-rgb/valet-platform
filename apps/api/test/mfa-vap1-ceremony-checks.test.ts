import { randomBytes } from "node:crypto";

import { generate } from "otplib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  verifyLockedEnrollmentConfirmation,
  verifyLockedMfaStepUp,
  verifyLockedRecoveryReissue,
  verifyLockedSelfRecoveryCode,
} from "../src/modules/auth/mfa/mfa-vap1-ceremony-checks";
import type { MfaFactorRow } from "../src/modules/auth/mfa/mfa-factor-repository";
import type { LockedMfaSession } from "../src/modules/auth/mfa/mfa-session-repository";
import { generateRecoveryCodes } from "../src/modules/auth/mfa/mfa-recovery-code";
import { protectTotpSecret } from "../src/modules/auth/mfa/mfa-secret-protection";
import { generateTotpSecret } from "../src/modules/auth/mfa/mfa-totp";

const userId = "00000000-0000-4000-8000-000000000001";
const factorId = "00000000-0000-4000-8000-000000000002";
const sessionId = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-11-13T12:00:15.000Z");

let priorTotpKey: string | undefined;
let priorRecoveryKey: string | undefined;
let priorBypass: string | undefined;
beforeEach(() => {
  priorTotpKey = process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL;
  priorRecoveryKey = process.env.MFA_RECOVERY_HMAC_SECRET_B64URL;
  priorBypass = process.env.VAYLET_LOCAL_DISABLE_MFA;
  process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL =
    randomBytes(32).toString("base64url");
  process.env.MFA_RECOVERY_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
});
afterEach(() => {
  for (const [name, prior] of [
    ["MFA_TOTP_ENCRYPTION_KEY_B64URL", priorTotpKey],
    ["MFA_RECOVERY_HMAC_SECRET_B64URL", priorRecoveryKey],
    ["VAYLET_LOCAL_DISABLE_MFA", priorBypass],
  ] as const) {
    if (prior === undefined) delete process.env[name];
    else process.env[name] = prior;
  }
});

async function fixture() {
  const secret = generateTotpSecret();
  const session = {
    id: sessionId,
    user_id: userId,
    now,
  } as LockedMfaSession;
  const factor = {
    id: factorId,
    user_id: userId,
    state: "ACTIVE",
    pending_enrollment_session_id: null,
    last_accepted_step: null,
    recovery_set_generation: 1,
    protected_secret: protectTotpSecret(secret, { userId, factorId }),
  } as MfaFactorRow;
  const step = Math.floor(now.getTime() / 30_000);
  const code = await generate({
    algorithm: "sha1",
    digits: 6,
    epoch: step * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
  return { session, factor, code, step };
}

describe("A05/A06/A07/A08 genuine MFA ceremony checks, never proof issuance", () => {
  it("A05 accepts raw TOTP only for same originating locked pending factor/session", async () => {
    const { session, factor, code, step } = await fixture();
    const pending = {
      ...factor,
      state: "PENDING" as const,
      pending_enrollment_session_id: session.id,
    };
    await expect(
      verifyLockedEnrollmentConfirmation(code, session, pending),
    ).resolves.toBe(step);
    await expect(
      verifyLockedEnrollmentConfirmation(code, session, {
        ...pending,
        pending_enrollment_session_id: factorId,
      }),
    ).resolves.toBeUndefined();
    await expect(
      verifyLockedEnrollmentConfirmation(
        code,
        {
          ...session,
          user_id: factorId,
        },
        pending,
      ),
    ).resolves.toBeUndefined();
  });

  it("A06 and A08 require actual raw TOTP, not accepted-step/ID or assurance snapshot", async () => {
    const { session, factor, code, step } = await fixture();
    await expect(verifyLockedMfaStepUp(code, session, factor)).resolves.toBe(
      step,
    );
    await expect(
      verifyLockedRecoveryReissue(code, session, factor),
    ).resolves.toBe(step);
    for (const supplied of [
      String(step),
      factor.id,
      session.id,
      "true",
      "12345",
    ]) {
      await expect(
        verifyLockedMfaStepUp(supplied, session, factor),
      ).resolves.toBeUndefined();
    }
    await expect(
      verifyLockedMfaStepUp(code, session, {
        ...factor,
        last_accepted_step: step,
      }),
    ).resolves.toBeUndefined();
    await expect(
      verifyLockedRecoveryReissue(
        code,
        {
          ...session,
          user_id: session.id,
        },
        factor,
      ),
    ).resolves.toBeUndefined();
  });

  it("A07 requires raw recovery code under locked factor User+generation", async () => {
    const { session, factor } = await fixture();
    const code = generateRecoveryCodes({
      factorId,
      userId,
      setGeneration: 1,
    })[0]!;
    const submittedCode = code.rawCode;
    expect(
      verifyLockedSelfRecoveryCode({
        submittedCode,
        session,
        factor,
        storedVerifier: code.verifier,
      }),
    ).toBe(true);
    for (const raw of [code.verifier, code.selector, factor.id, session.id]) {
      expect(
        verifyLockedSelfRecoveryCode({
          submittedCode: raw,
          session,
          factor,
          storedVerifier: code.verifier,
        }),
      ).toBe(false);
    }
    for (const different of [
      { ...factor, recovery_set_generation: 2 },
      { ...factor, user_id: session.id },
      { ...factor, state: "RETIRED" as const },
    ]) {
      expect(
        verifyLockedSelfRecoveryCode({
          submittedCode,
          session,
          factor: different,
          storedVerifier: code.verifier,
        }),
      ).toBe(false);
    }
  });

  it("local MFA bypass flag cannot replace a submitted TOTP or recovery secret", async () => {
    process.env.VAYLET_LOCAL_DISABLE_MFA = "true";
    const { session, factor } = await fixture();
    await expect(
      verifyLockedMfaStepUp("bypass", session, factor),
    ).resolves.toBeUndefined();
    expect(
      verifyLockedSelfRecoveryCode({
        submittedCode: "bypass",
        session,
        factor,
        storedVerifier: "mrv1." + "A".repeat(43),
      }),
    ).toBe(false);
  });
});
