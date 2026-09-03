import { describe, expect, it } from "vitest";

import { employeeNetworkError, normalizeEmployeeApiError } from "./api-error";

describe("normalizeEmployeeApiError", () => {
  it("preserves a shared-contract API error", () => {
    const error = normalizeEmployeeApiError(409, {
      code: "VERSION_CONFLICT",
      message: "Refresh before continuing.",
      requestId: "req_123",
    });

    expect(error).toMatchObject({
      code: "VERSION_CONFLICT",
      message: "Refresh before continuing.",
      requestId: "req_123",
      status: 409,
    });
  });

  it("keeps a stable code from a partial legacy payload", () => {
    const error = normalizeEmployeeApiError(429, {
      code: "RATE_LIMITED",
      message: " ",
      retryAfter: 15,
    });

    expect(error).toMatchObject({
      code: "RATE_LIMITED",
      message: "An error occurred while processing your request.",
      retryAfter: 15,
      status: 429,
    });
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "STAFF_AUTHENTICATION_REQUIRED"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [503, "SERVICE_UNAVAILABLE"],
    [599, "API_ERROR"],
  ])("falls back from status %s to %s", (status, code) => {
    expect(normalizeEmployeeApiError(status, "not-json").code).toBe(code);
  });

  it("represents a transport failure without retaining its cause", () => {
    const error = employeeNetworkError();

    expect(error).toMatchObject({
      code: "NETWORK_ERROR",
      isNetworkError: true,
      status: 0,
    });
  });
});
