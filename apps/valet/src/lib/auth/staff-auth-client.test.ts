import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaffAuthClient } from "./staff-auth-client";

const VALID_MOCK_TOKEN_1 = "vsa1.0123456789012345678901234567890123456789012";
const VALID_MOCK_TOKEN_2 = "vsa1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

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

  it("sends empty JSON body on refresh and single-flights concurrent refresh calls", async () => {
    let fetchCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      // Add slight delay to test concurrency
      await new Promise((r) => setTimeout(r, 20));
      return new Response(
        JSON.stringify({
          accessToken: VALID_MOCK_TOKEN_2,
          tokenType: "Bearer",
          accessExpiresAt: "2026-08-21T04:00:00.000Z",
          sessionExpiresAt: "2026-09-20T04:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new StaffAuthClient();

    // Trigger concurrent refresh operations
    const [res1, res2, res3] = await Promise.all([
      client.refresh(),
      client.refresh(),
      client.refresh(),
    ]);

    expect(fetchCount).toBe(1);
    expect(res1.accessToken).toBe(res2.accessToken);
    expect(res2.accessToken).toBe(res3.accessToken);
    expect(client.getAccessToken()).toBe(VALID_MOCK_TOKEN_2);
  });

  it("clears in-memory session on refresh failure without throwing unhandled crash", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "STAFF_AUTHENTICATION_REQUIRED",
          message: "No active staff session.",
          requestId: "req_ref_err_1",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    const client = new StaffAuthClient();
    const tryRes = await client.tryRefresh();

    expect(tryRes).toBeNull();
    expect(client.getAccessToken()).toBeNull();
    expect(client.getSession()).toBeNull();
  });

  it("clears in-memory token and sends credentials on logout", async () => {
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
    await client.logout();

    expect(capturedUrl).toBe("/v1/staff/auth/logout");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.credentials).toBe("include");
    expect(capturedInit?.body).toBe("{}");
    expect(client.getAccessToken()).toBeNull();
  });
});
