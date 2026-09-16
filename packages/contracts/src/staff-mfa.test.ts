import { describe, expect, it } from "vitest";

import {
  staffMfaEnrollmentBeginRequestSchema,
  staffMfaEnrollmentBeginResponseSchema,
  staffMfaEnrollmentConfirmRequestSchema,
  staffMfaEnrollmentConfirmResponseSchema,
  staffMfaRecoveryCodesReissueRequestSchema,
  staffMfaRecoveryCodesReissueResponseSchema,
  staffMfaRecoveryCodeSchema,
  staffMfaSelfRecoveryBeginRequestSchema,
  staffMfaStateResponseSchema,
  staffMfaStepUpRequestSchema,
  staffMfaStepUpResponseSchema,
  staffMfaTotpCodeSchema,
} from "./staff-mfa";

const factorId = "11111111-1111-4111-8111-111111111111";
const recoveryCode = `vmr1-${"a".repeat(11)}-${"B".repeat(27)}`;
const provisioning = {
  secretBase32: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP",
  issuer: "VAYLET",
  algorithm: "SHA1" as const,
  digits: 6 as const,
  periodSeconds: 30 as const,
};

describe("Staff MFA contracts", () => {
  it("accepts only an exact six-digit TOTP code", () => {
    expect(staffMfaTotpCodeSchema.parse("012345")).toBe("012345");
    for (const value of [
      "12345",
      "1234567",
      "12 345",
      "１２３４５６",
      "abcdef",
    ]) {
      expect(staffMfaTotpCodeSchema.safeParse(value).success).toBe(false);
    }
  });

  it("locks the versioned recovery-code wire format", () => {
    expect(staffMfaRecoveryCodeSchema.parse(recoveryCode)).toBe(recoveryCode);
    for (const value of [
      `vmr1-${"a".repeat(10)}-${"b".repeat(27)}`,
      `vmr1-${"a".repeat(11)}-${"b".repeat(26)}`,
      `vmr2-${"a".repeat(11)}-${"b".repeat(27)}`,
      `vmr1-${"a".repeat(11)}-${"!".repeat(27)}`,
    ]) {
      expect(staffMfaRecoveryCodeSchema.safeParse(value).success).toBe(false);
    }
  });

  it("returns structured provisioning material without accepting an otpauth URI", () => {
    const response = { factorId, provisioning };
    expect(staffMfaEnrollmentBeginRequestSchema.parse({})).toEqual({});
    expect(staffMfaEnrollmentBeginResponseSchema.parse(response)).toEqual(response);
    expect(
      staffMfaEnrollmentBeginResponseSchema.safeParse({
        ...response,
        otpauthUri: "otpauth://totp/example",
      }).success,
    ).toBe(false);
    expect(
      staffMfaEnrollmentBeginResponseSchema.safeParse({
        factorId: "not-a-uuid",
        provisioning,
      }).success,
    ).toBe(false);
    expect(
      staffMfaEnrollmentBeginResponseSchema.safeParse({
        factorId,
        provisioning: { ...provisioning, digits: 8 },
      }).success,
    ).toBe(false);
    expect(
      staffMfaEnrollmentBeginResponseSchema.safeParse({
        factorId,
        provisioning: {
          ...provisioning,
          secretBase32: provisioning.secretBase32.slice(0, 31),
        },
      }).success,
    ).toBe(false);
  });

  it("keeps enrollment confirmation strict and returns exactly ten recovery codes", () => {
    expect(
      staffMfaEnrollmentConfirmRequestSchema.parse({
        factorId,
        code: "012345",
      }),
    ).toEqual({ factorId, code: "012345" });
    expect(
      staffMfaEnrollmentConfirmRequestSchema.safeParse({
        factorId,
        code: "012345",
        userId: factorId,
      }).success,
    ).toBe(false);

    const recoveryCodes = Array.from({ length: 10 }, (_, index) =>
      `vmr1-${index.toString(36).padStart(11, "0")}-${"x".repeat(27)}`,
    );
    expect(
      staffMfaEnrollmentConfirmResponseSchema.parse({ recoveryCodes }),
    ).toEqual({ recoveryCodes });
    expect(
      staffMfaEnrollmentConfirmResponseSchema.safeParse({
        recoveryCodes: recoveryCodes.slice(0, 9),
      }).success,
    ).toBe(false);
    expect(
      staffMfaEnrollmentConfirmResponseSchema.safeParse({ factorId, recoveryCodes })
        .success,
    ).toBe(false);
  });

  it("keeps step-up and self-recovery secret-minimal and outputs safe", () => {
    expect(staffMfaStepUpRequestSchema.parse({ code: "654321" })).toEqual({
      code: "654321",
    });
    expect(
      staffMfaSelfRecoveryBeginRequestSchema.parse({ recoveryCode }),
    ).toEqual({ recoveryCode });
    expect(
      staffMfaSelfRecoveryBeginRequestSchema.safeParse({
        recoveryCode,
        email: "staff@example.com",
      }).success,
    ).toBe(false);

    const stepUp = { state: "ASSURED" as const };
    expect(staffMfaStepUpResponseSchema.parse(stepUp)).toEqual(stepUp);
    expect(
      staffMfaStepUpResponseSchema.safeParse({ ...stepUp, recoveryCode }).success,
    ).toBe(false);
  });

  it("supports explicit recovery-code reissue after activation lost-response", () => {
    const recoveryCodes = Array.from({ length: 10 }, (_, index) =>
      `vmr1-${index.toString(36).padStart(11, "0")}-${"r".repeat(27)}`,
    );
    expect(staffMfaRecoveryCodesReissueRequestSchema.parse({ code: "012345" })).toEqual({
      code: "012345",
    });
    expect(
      staffMfaRecoveryCodesReissueResponseSchema.parse({ factorId, recoveryCodes }),
    ).toEqual({ factorId, recoveryCodes });
    expect(
      staffMfaRecoveryCodesReissueResponseSchema.safeParse({
        factorId,
        recoveryCodes: recoveryCodes.slice(0, 9),
      }).success,
    ).toBe(false);
  });

  it("keeps MFA state bounded to a server-authored ceremony selector", () => {
    for (const state of [
      "ENROLLMENT_REQUIRED",
      "ENROLLMENT_PENDING",
      "STEP_UP_REQUIRED",
      "ASSURED",
    ] as const) {
      expect(staffMfaStateResponseSchema.parse({ state })).toEqual({ state });
    }
    expect(
      staffMfaStateResponseSchema.safeParse({
        state: "ASSURED",
        factorId,
      }).success,
    ).toBe(false);
    expect(
      staffMfaStateResponseSchema.safeParse({
        state: "UNKNOWN",
      }).success,
    ).toBe(false);
  });
});
