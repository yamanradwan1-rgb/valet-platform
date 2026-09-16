import { generate } from "otplib";
import { describe, expect, it } from "vitest";

import {
  generateTotpSecret,
  verifyTotpCode,
} from "../src/modules/auth/mfa/mfa-totp";

const now = new Date("2026-09-16T00:30:17.000Z");

async function codeAt(secret: string, timeStep: number): Promise<string> {
  return generate({
    algorithm: "sha1",
    digits: 6,
    epoch: timeStep * 30,
    period: 30,
    secret,
    strategy: "totp",
  });
}

describe("MFA TOTP", () => {
  it("generates an exact 20-byte Base32 secret", () => {
    for (let index = 0; index < 25; index += 1) {
      expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
    }
  });

  it("accepts exactly the previous, current, and next 30-second time steps", async () => {
    const secret = generateTotpSecret();
    const currentStep = Math.floor(now.getTime() / 1_000 / 30);

    for (const offset of [-1, 0, 1]) {
      const step = currentStep + offset;
      await expect(
        verifyTotpCode({ code: await codeAt(secret, step), now, secret }),
      ).resolves.toBe(step);
    }
    for (const offset of [-2, 2]) {
      await expect(
        verifyTotpCode({
          code: await codeAt(secret, currentStep + offset),
          now,
          secret,
        }),
      ).resolves.toBeUndefined();
    }
  });

  it("enforces the exclusive replay lower bound and returns the accepted step", async () => {
    const secret = generateTotpSecret();
    const currentStep = Math.floor(now.getTime() / 1_000 / 30);
    const currentCode = await codeAt(secret, currentStep);
    const nextCode = await codeAt(secret, currentStep + 1);

    await expect(
      verifyTotpCode({
        code: currentCode,
        lastAcceptedStep: currentStep,
        now,
        secret,
      }),
    ).resolves.toBeUndefined();
    await expect(
      verifyTotpCode({
        code: nextCode,
        lastAcceptedStep: currentStep,
        now,
        secret,
      }),
    ).resolves.toBe(currentStep + 1);
  });

  it("rejects malformed codes without invoking a permissive parser", async () => {
    const secret = generateTotpSecret();
    for (const code of ["", "12345", "1234567", "12 3456", "abcdef"]) {
      await expect(verifyTotpCode({ code, now, secret })).resolves.toBeUndefined();
    }
  });

  it("fails closed for corrupt internal secret/time/replay state", async () => {
    await expect(
      verifyTotpCode({ code: "123456", now, secret: "not-base32" }),
    ).rejects.toMatchObject({ code: "MFA_SECURITY_UNAVAILABLE" });
    await expect(
      verifyTotpCode({
        code: "123456",
        lastAcceptedStep: -1,
        now,
        secret: generateTotpSecret(),
      }),
    ).rejects.toMatchObject({ code: "MFA_SECURITY_UNAVAILABLE" });
  });
});
