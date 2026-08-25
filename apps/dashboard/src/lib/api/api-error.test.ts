import { describe, expect, it } from "vitest";

import {
  DashboardApiError,
  mapDashboardApiError,
  mapNetworkError,
} from "./api-error";

describe("mapDashboardApiError", () => {
  it("maps 401 to session-expired", () => {
    const error = mapDashboardApiError(401, {
      code: "STAFF_AUTHENTICATION_REQUIRED",
      message: "Staff authentication is required.",
    });
    expect(error.kind).toBe("session-expired");
    expect(error.status).toBe(401);
  });

  it("maps 403 to forbidden", () => {
    const error = mapDashboardApiError(403, { code: "SOME_FORBIDDEN" });
    expect(error.kind).toBe("forbidden");
  });

  it("preserves intentional authorization masking on 404", () => {
    for (const code of [
      "AUTHORIZATION_DENIED",
      "LOCATION_ACCESS_DENIED",
      "TENANT_ACCESS_DENIED",
    ]) {
      const error = mapDashboardApiError(404, { code });
      expect(error.kind).toBe("authorization-masked");
      expect(error.code).toBe(code);
    }
  });

  it("keeps a plain 404 as not-found", () => {
    const error = mapDashboardApiError(404, { code: "OTHER" });
    expect(error.kind).toBe("not-found");
  });

  it("maps optimistic-concurrency conflicts to conflict with backend code", () => {
    const error = mapDashboardApiError(409, {
      code: "CONFIGURATION_OVERRIDE_CONFLICT",
      message: "changed elsewhere",
    });
    expect(error.kind).toBe("conflict");
    expect(error.code).toBe("CONFIGURATION_OVERRIDE_CONFLICT");
  });

  it("maps validation errors", () => {
    const error = mapDashboardApiError(400, { code: "REQUEST_INVALID" });
    expect(error.kind).toBe("validation");
  });

  it("exposes retryAfter for rate limiting", () => {
    const error = mapDashboardApiError(429, {
      code: "STAFF_AUTHENTICATION_RATE_LIMITED",
      retryAfter: 42,
    });
    expect(error.kind).toBe("rate-limited");
    expect(error.retryAfter).toBe(42);
  });

  it("falls back safely for non-object or malformed payloads", () => {
    const error = mapDashboardApiError(500, "oops");
    expect(error.kind).toBe("server");
    expect(error.code).toBe("REQUEST_FAILED");
  });

  it("is a DashboardApiError instance usable in instanceof checks", () => {
    expect(mapDashboardApiError(500, undefined)).toBeInstanceOf(
      DashboardApiError,
    );
  });
});

describe("mapNetworkError", () => {
  it("marks network failures distinctly from HTTP outcomes", () => {
    const error = mapNetworkError();
    expect(error.isNetworkError).toBe(true);
    expect(error.status).toBe(0);
    expect(error.code).toBe("NETWORK_ERROR");
  });
});
