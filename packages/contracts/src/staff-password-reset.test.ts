import { describe, expect, it } from "vitest";

import {
  staffPasswordResetErrorSchema,
  staffPasswordResetIssueRequestSchema,
  staffPasswordResetIssueResponseSchema,
  staffPasswordResetRedeemRequestSchema,
  staffPasswordResetRedeemResponseSchema,
  staffPasswordResetStatusResponseSchema,
  staffPasswordResetTokenSchema,
} from "./staff-password-reset.js";

const token = `vspr1.${"A".repeat(43)}`;
const membershipId = "aa4e835a-0927-4754-8a9b-9cc9bcf98663";
const expiresAt = "2026-11-13T10:15:00.000Z";
const resetLink = `https://staff.example/staff/reset-password#reset=${token}`;
const issued = {
  outcome: "LINK_ISSUED",
  membershipId,
  generation: 1,
  expiresAt,
  resetLink,
};

describe("staff password reset contract", () => {
  it.each([
    [token, true],
    [`${token.slice(0, -1)}8`, true],
    [`${token.slice(0, -1)}B`, false],
    [`${token}=`, false],
    [`${token}\n`, false],
    [`vsr1.${"A".repeat(43)}`, false],
    [`vsa1.${"A".repeat(43)}`, false],
    [`vsi1.${"A".repeat(43)}`, false],
  ])("enforces canonical reset token encoding for %s", (value, valid) => {
    expect(staffPasswordResetTokenSchema.safeParse(value).success).toBe(valid);
  });

  it("accepts only the operation UUID and nonnegative integer generation", () => {
    const request = { operationId: membershipId, expectedGeneration: 0 };
    expect(staffPasswordResetIssueRequestSchema.parse(request)).toEqual(
      request,
    );
    for (const invalid of [
      { ...request, operationId: "operation-1" },
      { ...request, expectedGeneration: -1 },
      { ...request, expectedGeneration: 1.5 },
      { ...request, expectedGeneration: "1" },
      { ...request, targetUserId: membershipId },
    ]) {
      expect(
        staffPasswordResetIssueRequestSchema.safeParse(invalid).success,
      ).toBe(false);
    }
  });

  it("requires a canonical HTTPS reset page link for fresh issuance", () => {
    expect(staffPasswordResetIssueResponseSchema.parse(issued)).toEqual(issued);
    for (const invalid of [
      resetLink.replace("https:", "http:"),
      resetLink.replace("staff.example", "staff.example@other.example"),
      resetLink.replace("reset-password#", "reset-password?#"),
      resetLink.replace("reset-password#", "reset-password?source=1#"),
      resetLink.replace("reset-password", "activate"),
      resetLink.replace("#reset=", "#invite="),
      resetLink.replace("vspr1.", "vspr1%2E"),
      `${resetLink}&reset=${token}`,
    ]) {
      expect(
        staffPasswordResetIssueResponseSchema.safeParse({
          ...issued,
          resetLink: invalid,
        }).success,
      ).toBe(false);
    }
    expect(
      staffPasswordResetIssueResponseSchema.safeParse({
        ...issued,
        generation: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a reset link or private credential fields on replay or status", () => {
    const replay = {
      outcome: "LINK_UNAVAILABLE",
      membershipId,
      generation: 1,
      expiresAt,
    };
    const status = {
      eligible: true,
      latestGeneration: 0,
      linkState: "NONE",
      expiresAt: null,
    };
    expect(staffPasswordResetIssueResponseSchema.parse(replay)).toEqual(replay);
    expect(staffPasswordResetStatusResponseSchema.parse(status)).toEqual(
      status,
    );
    for (const field of [
      "resetLink",
      "operationId",
      "requestFingerprint",
      "tokenHash",
      "id",
    ]) {
      expect(
        staffPasswordResetIssueResponseSchema.safeParse({
          ...replay,
          [field]: resetLink,
        }).success,
      ).toBe(false);
      expect(
        staffPasswordResetStatusResponseSchema.safeParse({
          ...status,
          [field]: resetLink,
        }).success,
      ).toBe(false);
    }
  });

  it("uses the existing staff password creation policy and rejects extra inputs", () => {
    const request = { resetToken: token, newPassword: "🙂".repeat(15) };
    expect(staffPasswordResetRedeemRequestSchema.parse(request)).toEqual(
      request,
    );
    for (const invalid of [
      { ...request, newPassword: "🙂".repeat(14) },
      { ...request, newPassword: "a".repeat(129) },
      { ...request, newPassword: `newline\n${"a".repeat(15)}` },
      { ...request, userId: membershipId },
    ]) {
      expect(
        staffPasswordResetRedeemRequestSchema.safeParse(invalid).success,
      ).toBe(false);
    }
  });

  it("returns completion without authentication material", () => {
    const complete = { outcome: "PASSWORD_RESET_COMPLETE" };
    expect(staffPasswordResetRedeemResponseSchema.parse(complete)).toEqual(
      complete,
    );
    expect(
      staffPasswordResetRedeemResponseSchema.safeParse({
        ...complete,
        accessToken: token,
      }).success,
    ).toBe(false);
  });

  it("recognizes only the approved reset error codes in the safe error envelope", () => {
    const failure = {
      code: "STAFF_PASSWORD_RESET_INVALID",
      message: "The password reset link is invalid.",
      requestId: "reset-test-1",
    };
    expect(staffPasswordResetErrorSchema.parse(failure)).toEqual(failure);
    expect(
      staffPasswordResetErrorSchema.safeParse({ ...failure, resetToken: token })
        .success,
    ).toBe(false);
    expect(
      staffPasswordResetErrorSchema.safeParse({
        ...failure,
        code: "STAFF_ACTIVATION_FAILED",
      }).success,
    ).toBe(false);
    for (const code of [
      "STAFF_AUTHENTICATION_REQUIRED",
      "STAFF_AUTH_ORIGIN_NOT_ALLOWED",
      "AUTHORIZATION_DENIED",
      "MFA_STEP_UP_REQUIRED",
      "REQUEST_INVALID",
      "STAFF_PASSWORD_RESET_CONFLICT",
      "STAFF_PASSWORD_RESET_RATE_LIMITED",
      "STAFF_PASSWORD_RESET_UNAVAILABLE",
    ]) {
      expect(
        staffPasswordResetErrorSchema.safeParse({ ...failure, code }).success,
      ).toBe(true);
    }
  });
});
