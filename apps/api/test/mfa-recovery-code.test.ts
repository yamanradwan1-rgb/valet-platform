import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  generateRecoveryCodes,
  recoveryCodeSelector,
  verifyRecoveryCodeVerifier,
} from "../src/modules/auth/mfa/mfa-recovery-code";

const binding = {
  factorId: "00000000-0000-4000-8000-000000000002",
  setGeneration: 1,
  userId: "00000000-0000-4000-8000-000000000001",
};

let priorKey: string | undefined;

beforeEach(() => {
  priorKey = process.env.MFA_RECOVERY_HMAC_SECRET_B64URL;
  process.env.MFA_RECOVERY_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
});

afterEach(() => {
  if (priorKey === undefined) delete process.env.MFA_RECOVERY_HMAC_SECRET_B64URL;
  else process.env.MFA_RECOVERY_HMAC_SECRET_B64URL = priorKey;
});

describe("MFA recovery codes", () => {
  it("generates exactly ten independent high-entropy copyable codes", () => {
    const codes = generateRecoveryCodes(binding);
    expect(codes).toHaveLength(10);
    expect(new Set(codes.map((entry) => entry.rawCode)).size).toBe(10);
    expect(new Set(codes.map((entry) => entry.selector)).size).toBe(10);
    expect(new Set(codes.map((entry) => entry.verifier)).size).toBe(10);
    for (const entry of codes) {
      expect(entry.rawCode).toMatch(
        /^vmr1-[A-Za-z0-9_-]{11}-[A-Za-z0-9_-]{27}$/,
      );
      expect(entry.selector).toBe(recoveryCodeSelector(entry.rawCode));
      expect(entry.verifier).toMatch(/^mrv1\.[A-Za-z0-9_-]{43}$/);
      expect(entry.verifier).not.toContain(entry.rawCode);
    }
  });

  it("binds a verifier to the exact raw code, User, factor, and set generation", () => {
    const code = generateRecoveryCodes(binding)[0]!;
    expect(
      verifyRecoveryCodeVerifier({
        ...binding,
        rawCode: code.rawCode,
        verifier: code.verifier,
      }),
    ).toBe(true);

    const other = generateRecoveryCodes(binding)[0]!;
    for (const candidate of [
      { ...binding, rawCode: other.rawCode },
      {
        ...binding,
        rawCode: code.rawCode,
        userId: "00000000-0000-4000-8000-000000000003",
      },
      {
        ...binding,
        factorId: "00000000-0000-4000-8000-000000000004",
        rawCode: code.rawCode,
      },
      { ...binding, rawCode: code.rawCode, setGeneration: 2 },
    ]) {
      expect(
        verifyRecoveryCodeVerifier({
          ...candidate,
          verifier: code.verifier,
        }),
      ).toBe(false);
    }
  });

  it("extracts only the non-secret selector from canonical raw codes", () => {
    const code = generateRecoveryCodes(binding)[0]!;
    expect(recoveryCodeSelector(code.rawCode)).toBe(code.selector);
    for (const malformed of [
      "",
      code.rawCode.toUpperCase(),
      code.rawCode.replace("vmr1-", "vmr2-"),
      `${code.rawCode}x`,
    ]) {
      expect(recoveryCodeSelector(malformed)).toBeUndefined();
    }
  });

  it("fails closed for missing or malformed recovery verifier configuration", () => {
    const valid = process.env.MFA_RECOVERY_HMAC_SECRET_B64URL;
    for (const value of [undefined, "too-short", `${valid}=`]) {
      if (value === undefined) delete process.env.MFA_RECOVERY_HMAC_SECRET_B64URL;
      else process.env.MFA_RECOVERY_HMAC_SECRET_B64URL = value;
      expect(() => generateRecoveryCodes(binding)).toThrow(
        expect.objectContaining({
          code: "MFA_SECURITY_UNAVAILABLE",
          message: "MFA security is unavailable.",
        }),
      );
    }
  });

  it("returns false for malformed stored verifier or raw code", () => {
    const code = generateRecoveryCodes(binding)[0]!;
    expect(
      verifyRecoveryCodeVerifier({
        ...binding,
        rawCode: "not-a-code",
        verifier: code.verifier,
      }),
    ).toBe(false);
    expect(
      verifyRecoveryCodeVerifier({
        ...binding,
        rawCode: code.rawCode,
        verifier: "not-a-verifier",
      }),
    ).toBe(false);
  });
});
