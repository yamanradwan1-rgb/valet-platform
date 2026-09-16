import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MfaSecurityUnavailableError } from "../src/modules/auth/mfa/mfa-crypto-config";
import {
  protectTotpSecret,
  unprotectTotpSecret,
} from "../src/modules/auth/mfa/mfa-secret-protection";
import { generateTotpSecret } from "../src/modules/auth/mfa/mfa-totp";

const binding = {
  factorId: "00000000-0000-4000-8000-000000000002",
  userId: "00000000-0000-4000-8000-000000000001",
};

let priorKey: string | undefined;

beforeEach(() => {
  priorKey = process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL;
  process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL =
    randomBytes(32).toString("base64url");
});

afterEach(() => {
  if (priorKey === undefined) delete process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL;
  else process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL = priorKey;
});

describe("MFA TOTP secret protection", () => {
  it("round-trips a TOTP secret without exposing it in the envelope", () => {
    const secret = generateTotpSecret();
    const protectedSecret = protectTotpSecret(secret, binding);

    expect(protectedSecret).toMatch(
      /^mte1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/,
    );
    expect(protectedSecret).not.toContain(secret);
    expect(unprotectTotpSecret(protectedSecret, binding)).toBe(secret);
  });

  it("authenticates the exact User and factor binding", () => {
    const protectedSecret = protectTotpSecret(generateTotpSecret(), binding);
    for (const changedBinding of [
      { ...binding, userId: "00000000-0000-4000-8000-000000000003" },
      { ...binding, factorId: "00000000-0000-4000-8000-000000000004" },
    ]) {
      expect(() => unprotectTotpSecret(protectedSecret, changedBinding)).toThrow(
        MfaSecurityUnavailableError,
      );
    }
  });

  it("fails closed for a missing, malformed, or wrong key", () => {
    const secret = generateTotpSecret();
    const protectedSecret = protectTotpSecret(secret, binding);
    const validKey = process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL;

    for (const value of [undefined, "too-short", `${validKey}=`, "A".repeat(43)]) {
      if (value === undefined) delete process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL;
      else process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL = value;
      expect(() => unprotectTotpSecret(protectedSecret, binding)).toThrow(
        expect.objectContaining({
          code: "MFA_SECURITY_UNAVAILABLE",
          message: "MFA security is unavailable.",
        }),
      );
    }
  });

  it("fails closed for malformed or tampered ciphertext without disclosing it", () => {
    const secret = generateTotpSecret();
    const protectedSecret = protectTotpSecret(secret, binding);
    const candidates = [
      "not-an-envelope",
      protectedSecret.replace(/^mte1\./, "mte2."),
      `${protectedSecret.slice(0, -1)}${protectedSecret.endsWith("A") ? "B" : "A"}`,
    ];

    for (const candidate of candidates) {
      try {
        unprotectTotpSecret(candidate, binding);
        throw new Error("Expected protected secret rejection.");
      } catch (error) {
        expect(error).toMatchObject({
          code: "MFA_SECURITY_UNAVAILABLE",
          message: "MFA security is unavailable.",
        });
        expect((error as Error).message).not.toContain(secret);
        expect((error as Error).message).not.toContain(candidate);
      }
    }
  });
});
