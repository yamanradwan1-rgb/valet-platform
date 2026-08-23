import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "../api/employee-api-errors";
import { StaffAuthClient } from "./staff-auth-client";

const VALID_MOCK_TOKEN_1 = "vsa1.0123456789012345678901234567890123456789012";

describe("StaffAuthClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends correct login request without caller-selected authority fields and stores token in memory only", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(
          JSON.stringify({
            accessToken: VALID_MOCK_TOKEN_1,
            tokenType: "Bearer",
            accessExpiresAt: "2026-08-21T03:00:00.000Z",
            sessionExpiresAt: "2026-09-20T03:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

    const client = new StaffAuthClient();
    const result = await client.login({
      email: "valet.driver@example.com",
      password: "SuperSecretPassword123!",
    });

    expect(capturedUrl).toBe("/v1/staff/auth/login");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.credentials).toBe("include");
    expect(capturedInit?.cache).toBe("no-store");

    const body = JSON.parse(capturedInit?.body as string);
    expect(body).toEqual({
      email: "valet.driver@example.com",
      password: "SuperSecretPassword123!",
    });
    // Ensure no caller-selected authority fields are sent
    expect(body.role).toBeUndefined();
    expect(body.organizationId).toBeUndefined();
    expect(body.locationId).toBeUndefined();

    // Verify token stored in-memory
    expect(client.getAccessToken()).toBe(VALID_MOCK_TOKEN_1);
    expect(client.getSession()?.accessExpiresAt).toBe(
      "2026-08-21T03:00:00.000Z",
    );
    expect(result.tokenType).toBe("Bearer");

    // Verify no persistence in browser storage
    if (typeof window !== "undefined") {
      expect(window.localStorage?.getItem("accessToken")).toBeNull();
      expect(window.sessionStorage?.getItem("accessToken")).toBeNull();
    }
  });

  it("handles 204 logout successfully and removes local in-memory session", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(null, { status: 204 });
      });

    const client = new StaffAuthClient();
    // Seed in-memory token
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: VALID_MOCK_TOKEN_1,
          tokenType: "Bearer",
          accessExpiresAt: "2026-08-21T03:00:00.000Z",
          sessionExpiresAt: "2026-09-20T03:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await client.login({
      email: "valet@example.com",
      password: "Password123!",
    });
    expect(client.getAccessToken()).toBe(VALID_MOCK_TOKEN_1);

    // Perform 204 logout
    globalThis.fetch = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return new Response(null, { status: 204 });
      });

    await client.logout();

    expect(capturedUrl).toBe("/v1/staff/auth/logout");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.credentials).toBe("include");
    expect(capturedInit?.body).toBe("{}");
    expect(client.getAccessToken()).toBeNull();
    expect(client.getSession()).toBeNull();
  });

  it("surfaces 500 server logout failure as EmployeeApiError while still clearing local session", async () => {
    const client = new StaffAuthClient();

    // Seed session
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: VALID_MOCK_TOKEN_1,
          tokenType: "Bearer",
          accessExpiresAt: "2026-08-21T03:00:00.000Z",
          sessionExpiresAt: "2026-09-20T03:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await client.login({
      email: "valet@example.com",
      password: "Password123!",
    });
    expect(client.getAccessToken()).toBe(VALID_MOCK_TOKEN_1);

    // Mock 500 server error on logout
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database connection failed during session revocation.",
          requestId: "req_logout_500",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(client.logout()).rejects.toThrow(EmployeeApiError);

    // Security invariant: Local session MUST still be cleared after logout attempt
    expect(client.getAccessToken()).toBeNull();
    expect(client.getSession()).toBeNull();
  });

  it("surfaces network failure during logout as EmployeeApiError while still clearing local session", async () => {
    const client = new StaffAuthClient();

    // Seed session
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: VALID_MOCK_TOKEN_1,
          tokenType: "Bearer",
          accessExpiresAt: "2026-08-21T03:00:00.000Z",
          sessionExpiresAt: "2026-09-20T03:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await client.login({
      email: "valet@example.com",
      password: "Password123!",
    });
    expect(client.getAccessToken()).toBe(VALID_MOCK_TOKEN_1);

    // Mock network failure on logout
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(client.logout()).rejects.toThrow(EmployeeApiError);

    // Security invariant: Local session MUST still be cleared after logout attempt
    expect(client.getAccessToken()).toBeNull();
    expect(client.getSession()).toBeNull();
  });
});
