import { createHash, randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MfaSecurityUnavailableError } from "../src/modules/auth/mfa/mfa-crypto-config";
import { unprotectTotpSecret } from "../src/modules/auth/mfa/mfa-secret-protection";
import { generateTotpSecret } from "../src/modules/auth/mfa/mfa-totp";
import { preparePendingMfaMaterial } from "../src/modules/auth/mfa/mfa-vap1-pending-material";

const binding = {
  userId: "00000000-0000-4000-8000-000000000001",
  factorId: "00000000-0000-4000-8000-000000000002",
};
let previousKey: string | undefined;

beforeEach(() => {
  previousKey = process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL;
  process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL =
    randomBytes(32).toString("base64url");
});

afterEach(() => {
  if (previousKey === undefined) {
    delete process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL;
  } else {
    process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL = previousKey;
  }
});

describe("A04-create/A07 VAP1 candidate encrypted seed material", () => {
  it("binds the exact mte1 ciphertext and seed to distinct domain-separated digests", () => {
    const secret = generateTotpSecret();
    const material = preparePendingMfaMaterial(secret, binding);

    expect(material.protectedSecret).toMatch(
      /^mte1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/,
    );
    expect(material.protectedSecret).not.toContain(secret);
    expect(unprotectTotpSecret(material.protectedSecret, binding)).toBe(secret);
    expect(material.seedDigest).toEqual(
      createHash("sha256")
        .update("mfa-totp-seed:v1:", "utf8")
        .update(secret, "utf8")
        .digest(),
    );
    expect(material.envelopeDigest).toEqual(
      createHash("sha256")
        .update("mfa-protected-envelope:v1:", "utf8")
        .update(material.protectedSecret, "utf8")
        .digest(),
    );
    expect(material.seedDigest).toHaveLength(32);
    expect(material.envelopeDigest).toHaveLength(32);
  });

  it("uses a fresh IV for each encryption while keeping the same seed commitment", () => {
    const secret = generateTotpSecret();
    const first = preparePendingMfaMaterial(secret, binding);
    const second = preparePendingMfaMaterial(secret, binding);
    expect(first.seedDigest).toEqual(second.seedDigest);
    expect(first.protectedSecret).not.toBe(second.protectedSecret);
    expect(first.envelopeDigest).not.toEqual(second.envelopeDigest);
  });

  it("does not allow mte1 material to be reused for another User or factor", () => {
    const material = preparePendingMfaMaterial(generateTotpSecret(), binding);
    for (const changed of [
      { ...binding, userId: "00000000-0000-4000-8000-000000000003" },
      { ...binding, factorId: "00000000-0000-4000-8000-000000000004" },
    ]) {
      expect(() => unprotectTotpSecret(material.protectedSecret, changed)).toThrow(
        MfaSecurityUnavailableError,
      );
    }
  });

  it("fails closed without the original MFA encryption root", () => {
    delete process.env.MFA_TOTP_ENCRYPTION_KEY_B64URL;
    expect(() =>
      preparePendingMfaMaterial(generateTotpSecret(), binding),
    ).toThrow(MfaSecurityUnavailableError);
  });
});
