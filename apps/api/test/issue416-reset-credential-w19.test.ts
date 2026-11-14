import { createHash } from "node:crypto";

import { HttpStatus, UnauthorizedException } from "@nestjs/common";
import {
  staffPasswordResetErrorSchema,
  staffPasswordResetTokenSchema,
} from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { apiHttpException, mapApiError } from "../src/common/http/api-errors";
import {
  generateStaffPasswordResetToken,
  staffPasswordResetTokenHash,
} from "../src/modules/auth/staff-password-reset-credential";

describe("Issue 416 reset credential and transport boundary", () => {
  it("generates a canonical 256-bit reset token without padding", () => {
    const token = generateStaffPasswordResetToken();
    expect(staffPasswordResetTokenSchema.parse(token)).toBe(token);
    const encoded = token.slice("vspr1.".length);
    expect(Buffer.from(encoded, "base64url")).toHaveLength(32);
    expect(Buffer.from(encoded, "base64url").toString("base64url")).toBe(
      encoded,
    );
  });

  it("hashes only canonical reset tokens with a purpose-separated domain", () => {
    const token = `vspr1.${"A".repeat(43)}`;
    const prefix = "staff-password-reset-sha256:v1:";
    const hash = staffPasswordResetTokenHash(token);
    expect(hash).toBe(
      prefix +
        createHash("sha256")
          .update(prefix + token)
          .digest("hex"),
    );
    expect(hash).toMatch(/^staff-password-reset-sha256:v1:[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hash).not.toBe(createHash("sha256").update(token).digest("hex"));
  });

  it.each([
    "",
    "vspr1.",
    `vspr1.${"A".repeat(42)}`,
    `vspr1.${"A".repeat(42)}B`,
    `vspr1.${"A".repeat(43)}=`,
    `vsr1.${"A".repeat(43)}`,
    `vsi1.${"A".repeat(43)}`,
    `vspr1.${"A".repeat(42)}+`,
  ])("refuses an invalid hash preimage without echoing it", (token) => {
    expect(() => staffPasswordResetTokenHash(token)).toThrowError(
      "Invalid staff password reset token.",
    );
  });

  it("maps required protected authentication and public origin failure safely", () => {
    const missingSession = mapApiError(new UnauthorizedException("secret"));
    const blockedOrigin = mapApiError({
      code: "STAFF_AUTH_ORIGIN_NOT_ALLOWED",
      message: "secret",
    });
    expect(missingSession).toEqual({
      code: "STAFF_AUTHENTICATION_REQUIRED",
      message: "Staff authentication is required.",
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(blockedOrigin).toEqual({
      code: "STAFF_AUTH_ORIGIN_NOT_ALLOWED",
      message: "The request origin is not allowed.",
      status: HttpStatus.FORBIDDEN,
    });
    for (const mapped of [missingSession, blockedOrigin]) {
      expect(
        staffPasswordResetErrorSchema.parse(
          apiHttpException(mapped, "reset-test-1").getResponse(),
        ),
      ).toEqual({
        code: mapped.code,
        message: mapped.message,
        requestId: "reset-test-1",
      });
    }
  });
});
