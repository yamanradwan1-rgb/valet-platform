import { createHash } from "node:crypto";

import { HttpStatus } from "@nestjs/common";
import {
  staffPasswordResetErrorSchema,
  staffPasswordResetTokenSchema,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import {
  apiHttpException,
  ApiTransportValidationError,
  mapApiError,
} from "../src/common/http/api-errors";
import { STAFF_PASSWORD_RESET_ANTI_ABUSE } from "../src/modules/anti-abuse/anti-abuse-key";
import {
  generateStaffPasswordResetToken,
  staffPasswordResetTokenHash,
} from "../src/modules/auth/staff-password-reset-credential";

describe("staff password reset API policy", () => {
  it.each([
    [
      "AUTHORIZATION_DENIED",
      HttpStatus.NOT_FOUND,
      "The requested resource is not available.",
    ],
    [
      "MFA_STEP_UP_REQUIRED",
      HttpStatus.FORBIDDEN,
      "Additional authentication is required.",
    ],
    [
      "STAFF_PASSWORD_RESET_CONFLICT",
      HttpStatus.CONFLICT,
      "The password reset request conflicts with a prior operation.",
    ],
    [
      "STAFF_PASSWORD_RESET_INVALID",
      HttpStatus.UNAUTHORIZED,
      "The password reset link is invalid.",
    ],
    [
      "STAFF_PASSWORD_RESET_RATE_LIMITED",
      HttpStatus.TOO_MANY_REQUESTS,
      "Too many requests. Try again later.",
    ],
    [
      "STAFF_PASSWORD_RESET_UNAVAILABLE",
      HttpStatus.SERVICE_UNAVAILABLE,
      "Service temporarily unavailable.",
    ],
  ] as const)(
    "maps %s to the approved safe HTTP response",
    (code, status, message) => {
      const mapped = mapApiError({
        code,
        message: "secret diagnostic material",
      });
      expect(mapped).toEqual({ code, status, message });
      expect(
        staffPasswordResetErrorSchema.parse(
          apiHttpException(mapped, "reset-test-1").getResponse(),
        ),
      ).toEqual({ code, message, requestId: "reset-test-1" });
    },
  );

  it("keeps malformed transport errors on the existing generic request contract", () => {
    expect(mapApiError(new ApiTransportValidationError())).toEqual({
      code: "REQUEST_INVALID",
      status: HttpStatus.BAD_REQUEST,
      message: "The request is invalid.",
    });
  });

  it("preserves the bounded Retry-After from durable admission", () => {
    const mapped = mapApiError({
      code: "STAFF_PASSWORD_RESET_RATE_LIMITED",
      retryAfter: 900,
    });
    expect(mapped.retryAfter).toBe(900);
    expect(apiHttpException(mapped, "reset-test-1")).toHaveProperty(
      "retryAfter",
      900,
    );
  });

  it("generates reset-specific tokens with 32 canonically encoded random bytes", () => {
    const token = generateStaffPasswordResetToken();
    expect(staffPasswordResetTokenSchema.parse(token)).toBe(token);
    const encoded = token.slice("vspr1.".length);
    const bytes = Buffer.from(encoded, "base64url");
    expect(bytes).toHaveLength(32);
    expect(bytes.toString("base64url")).toBe(encoded);
    expect(generateStaffPasswordResetToken()).not.toBe(token);
  });

  it("uses the reset domain in both the private verifier and its preimage", () => {
    const token = `vspr1.${"A".repeat(43)}`;
    const domain = "staff-password-reset-sha256:v1:";
    const expectedDigest = createHash("sha256")
      .update(domain + token)
      .digest("hex");
    expect(staffPasswordResetTokenHash(token)).toBe(domain + expectedDigest);
    expect(staffPasswordResetTokenHash(token)).not.toContain(token);
  });

  it("sets the approved limits in six distinct anti-abuse scopes", () => {
    const policy = STAFF_PASSWORD_RESET_ANTI_ABUSE;
    expect([
      policy.issueTargetUser.limit,
      policy.issueIssuerUser.limit,
      policy.issueOrganization.limit,
      policy.issueClientAddress.limit,
      policy.redeemClientAddress.limit,
      policy.redeemCredential.limit,
    ]).toEqual([3, 20, 100, 30, 30, 5]);
    expect(new Set(Object.values(policy).map(({ scope }) => scope)).size).toBe(
      6,
    );
  });
});
