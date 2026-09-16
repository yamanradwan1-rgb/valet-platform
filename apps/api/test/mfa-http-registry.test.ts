import { HttpStatus } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { mapApiError } from "../src/common/http/api-errors";
import { staffAuthOperationRoutes } from "../src/common/http/staff-auth-operation-routes";

describe("MFA API error mapping", () => {
  it.each([
    ["MFA_STEP_UP_REQUIRED", HttpStatus.FORBIDDEN, "Additional authentication is required."],
    ["MFA_VERIFICATION_FAILED", HttpStatus.FORBIDDEN, "MFA verification failed."],
    ["MFA_RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Try again later."],
    ["MFA_ENROLLMENT_NOT_AVAILABLE", HttpStatus.CONFLICT, "MFA enrollment is not available."],
    ["MFA_SECURITY_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE, "Service temporarily unavailable."],
  ] as const)("maps %s to a bounded safe response", (code, status, message) => {
    expect(mapApiError({ code, message: "unsafe internal detail" })).toEqual({
      code,
      message,
      status,
    });
  });

  it("preserves bounded Retry-After for MFA rate limiting", () => {
    expect(
      mapApiError({
        code: "MFA_RATE_LIMITED",
        message: "do not expose me",
        retryAfter: 37,
      }),
    ).toEqual({
      code: "MFA_RATE_LIMITED",
      message: "Too many requests. Try again later.",
      retryAfter: 37,
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});

describe("MFA safe observability route registry", () => {
  it.each([
    ["GET", "/v1/staff/auth/mfa/state", "STAFF_AUTH_MFA_STATE"],
    [
      "POST",
      "/v1/staff/auth/mfa/enrollment/begin",
      "STAFF_AUTH_MFA_ENROLLMENT_BEGIN",
    ],
    [
      "POST",
      "/v1/staff/auth/mfa/enrollment/confirm",
      "STAFF_AUTH_MFA_ENROLLMENT_CONFIRM",
    ],
    ["POST", "/v1/staff/auth/mfa/step-up", "STAFF_AUTH_MFA_STEP_UP"],
    [
      "POST",
      "/v1/staff/auth/mfa/recovery/begin",
      "STAFF_AUTH_MFA_SELF_RECOVERY_BEGIN",
    ],
    [
      "POST",
      "/v1/staff/auth/mfa/recovery-codes/reissue",
      "STAFF_AUTH_MFA_RECOVERY_CODES_REISSUE",
    ],
  ] as const)("registers %s %s as %s", (method, path, operation) => {
    expect(
      staffAuthOperationRoutes.find(
        (route) => route.method === method && route.path.test(path),
      )?.operation,
    ).toBe(operation);
  });

  it("does not allow path suffixes to collapse into an MFA operation", () => {
    expect(
      staffAuthOperationRoutes.some((route) =>
        route.path.test("/v1/staff/auth/mfa/step-up/secret"),
      ),
    ).toBe(false);
  });
});
