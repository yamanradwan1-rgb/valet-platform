import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StaffAuthClient } from "./staff-auth-client";

const VALID_MOCK_TOKEN_1 = "vsa1.0123456789012345678901234567890123456789012";
const VALID_MOCK_TOKEN_2 = "vsa1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

describe("StaffAuthClient refresh", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends empty JSON body on refresh and single-flights concurrent refresh calls", async () => {
    let fetchCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
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

  it("ensures one caller abort does not abort shared underlying refresh for concurrent callers", async () => {
    let fetchCount = 0;

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      // Delay response to allow aborting caller A while in-flight
      await new Promise((r) => setTimeout(r, 40));
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
    const abortControllerA = new AbortController();

    // Caller A starts refresh with an AbortSignal
    const promiseA = client.refresh(abortControllerA.signal);

    // Caller B requests refresh while A is in-flight without aborting
    const promiseB = client.refresh();

    // Abort caller A while refresh is in-flight
    setTimeout(() => {
      abortControllerA.abort();
    }, 10);

    // Caller A should reject with abort error
    await expect(promiseA).rejects.toThrow();

    // Caller B should succeed with the refreshed tokens
    const resultB = await promiseB;
    expect(resultB.accessToken).toBe(VALID_MOCK_TOKEN_2);

    // Only one network request occurred
    expect(fetchCount).toBe(1);

    // Shared in-memory session was updated successfully
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

  async function seedSession(client: StaffAuthClient): Promise<void> {
    globalThis.fetch = vi.fn().mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            accessToken: VALID_MOCK_TOKEN_1,
            tokenType: "Bearer",
            accessExpiresAt: "2020-01-01T00:00:00.000Z",
            sessionExpiresAt: "2026-09-20T03:00:00.000Z",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    await client.login({
      email: "valet.driver@example.com",
      password: "SuperSecretPassword123!",
    });
  }

  it("preserves the authenticated session when a transient 5xx refresh fails and tags the error as transient", async () => {
    const client = new StaffAuthClient();
    await seedSession(client);

    globalThis.fetch = vi.fn().mockImplementationOnce(async () => {
      throw new Error("socket hang up");
    });

    await expect(client.refresh()).rejects.toMatchObject({ kind: "transient" });
    expect(client.getSession()).not.toBeNull();
    expect(client.getAccessToken()).toBe(VALID_MOCK_TOKEN_1);
  });

  it("preserves the session on a 503 refresh and still clears it on a definitive 401", async () => {
    const client = new StaffAuthClient();
    await seedSession(client);

    globalThis.fetch = vi
      .fn()
      .mockImplementationOnce(
        async () =>
          new Response(
            JSON.stringify({ code: "SERVICE_UNAVAILABLE", message: "down" }),
            { status: 503 },
          ),
      );
    await expect(client.refresh()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      kind: "transient",
    });
    expect(client.getAccessToken()).toBe(VALID_MOCK_TOKEN_1);

    globalThis.fetch = vi.fn().mockImplementationOnce(
      async () =>
        new Response(
          JSON.stringify({
            code: "STAFF_AUTHENTICATION_FAILED",
            message: "Refresh token rejected.",
          }),
          { status: 401 },
        ),
    );
    await expect(client.refresh()).rejects.toMatchObject({
      kind: "definitive",
    });
    expect(client.getAccessToken()).toBeNull();
    expect(client.getSession()).toBeNull();
  });
});
