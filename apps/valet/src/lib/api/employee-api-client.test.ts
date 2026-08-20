import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaffAuthClient } from "../auth/staff-auth-client";
import { EmployeeApiClient } from "./employee-api-client";
import { EmployeeApiError } from "./employee-api-errors";

const VALID_MOCK_TOKEN_1 = "vsa1.0123456789012345678901234567890123456789012";
const VALID_MOCK_TOKEN_2 = "vsa1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

describe("EmployeeApiClient", () => {
  let originalFetch: typeof globalThis.fetch;
  let authClient: StaffAuthClient;
  let apiClient: EmployeeApiClient;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    authClient = new StaffAuthClient();
    apiClient = new EmployeeApiClient({ authClient });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("attaches Authorization header for authenticated requests", async () => {
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) => {
        capturedHeaders = init.headers as Record<string, string>;
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

    // Seed in-memory token with future expiration
    vi.spyOn(authClient, "isTokenFresh").mockReturnValue(true);
    vi.spyOn(authClient, "getAccessToken").mockReturnValue(VALID_MOCK_TOKEN_1);

    const result = await apiClient.request<{ status: string }>(
      "/v1/staff/tasks",
      {
        method: "GET",
      },
    );

    expect(result).toEqual({ status: "ok" });
    expect(capturedHeaders["Authorization"]).toBe(
      `Bearer ${VALID_MOCK_TOKEN_1}`,
    );
  });

  it("throws error when requiring auth but no active session exists", async () => {
    vi.spyOn(authClient, "ensureFreshToken").mockResolvedValue(null);

    await expect(
      apiClient.request("/v1/staff/tasks", { method: "GET" }),
    ).rejects.toThrow(EmployeeApiError);
  });

  it("DOES NOT automatically replay non-idempotent mutations on 401", async () => {
    let postCallCount = 0;

    globalThis.fetch = vi
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) => {
        if (init.method === "POST") {
          postCallCount++;
          return new Response(
            JSON.stringify({
              code: "STAFF_AUTHENTICATION_REQUIRED",
              message: "Session expired.",
              requestId: "req_post_401",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 200 });
      });

    vi.spyOn(authClient, "isTokenFresh").mockReturnValue(true);
    vi.spyOn(authClient, "getAccessToken").mockReturnValue(VALID_MOCK_TOKEN_1);
    const refreshSpy = vi.spyOn(authClient, "refresh");

    await expect(
      apiClient.request("/v1/staff/check-in/intake", {
        method: "POST",
        body: { plateNumber: "12-34567" },
      }),
    ).rejects.toThrow(EmployeeApiError);

    // CRITICAL: Must not issue refresh and must not replay the POST mutation!
    expect(postCallCount).toBe(1);
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("safely retries idempotent GET read requests once after 401 refresh", async () => {
    let getCallCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/v1/staff/tasks")) {
        getCallCount++;
        if (getCallCount === 1) {
          return new Response(
            JSON.stringify({
              code: "STAFF_AUTHENTICATION_REQUIRED",
              message: "Token expired.",
              requestId: "req_get_401",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify({ tasks: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/v1/staff/auth/refresh")) {
        return new Response(
          JSON.stringify({
            accessToken: VALID_MOCK_TOKEN_2,
            tokenType: "Bearer",
            accessExpiresAt: "2026-08-21T05:00:00.000Z",
            sessionExpiresAt: "2026-09-20T05:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response("{}", { status: 200 });
    });

    vi.spyOn(authClient, "isTokenFresh").mockReturnValue(true);
    vi.spyOn(authClient, "getAccessToken").mockReturnValue(VALID_MOCK_TOKEN_1);

    const result = await apiClient.request<{ tasks: unknown[] }>(
      "/v1/staff/tasks",
      {
        method: "GET",
      },
    );

    expect(result).toEqual({ tasks: [] });
    expect(getCallCount).toBe(2);
  });
});
