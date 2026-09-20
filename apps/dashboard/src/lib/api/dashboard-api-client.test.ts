import { staffMfaStateResponseSchema } from "@valet/contracts";
import { describe, expect, it, vi } from "vitest";

import { DashboardApiClient } from "./dashboard-api-client";
import { DashboardApiError, dashboardApiErrorFromResponse } from "./dashboard-api-error";

function authProvider() {
  let currentToken = "old-token";
  let sessionGeneration = 2;
  return {
    getAccessToken: () => currentToken,
    getIdentityGeneration: () => 4,
    getSessionGeneration: () => sessionGeneration,
    isTokenFresh: () => true,
    refresh: vi.fn(async () => {
      currentToken = "new-token";
      sessionGeneration += 1;
      return {
        accessToken: "vsa1.a" + "a".repeat(42),
        tokenType: "Bearer" as const,
        accessExpiresAt: "2099-01-01T00:00:00.000Z",
        sessionExpiresAt: "2099-02-01T00:00:00.000Z",
      };
    }),
  };
}

describe("DashboardApiClient", () => {
  it("replays a GET once after one refresh", async () => {
    const auth = authProvider();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "STAFF_AUTHENTICATION_FAILED", message: "expired", requestId: "req-1" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ state: "ASSURED" }), { status: 200 }));
    const api = new DashboardApiClient({ auth, fetch: fetcher });

    await expect(api.request("/safe", staffMfaStateResponseSchema)).resolves.toEqual({ state: "ASSURED" });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe("Bearer old-token");
    expect((fetcher.mock.calls[1]?.[1]?.headers as Record<string, string>).Authorization).toBe("Bearer new-token");
  });

  it("accepts the identity boundary created by an initial cookie refresh before first send", async () => {
    let currentToken: string | null = null;
    let identity = 0;
    let sessionGeneration = 0;
    const auth = {
      getAccessToken: () => currentToken,
      getIdentityGeneration: () => identity,
      getSessionGeneration: () => sessionGeneration,
      isTokenFresh: () => currentToken !== null,
      refresh: vi.fn(async () => {
        currentToken = "restored-token";
        identity += 1;
        sessionGeneration += 1;
        return {
          accessToken: "vsa1.a" + "a".repeat(42),
          tokenType: "Bearer" as const,
          accessExpiresAt: "2099-01-01T00:00:00.000Z",
          sessionExpiresAt: "2099-02-01T00:00:00.000Z",
        };
      }),
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ state: "ASSURED" }), { status: 200 }),
    );
    const api = new DashboardApiClient({ auth, fetch: fetcher });

    await expect(api.request("/state", staffMfaStateResponseSchema)).resolves.toEqual({
      state: "ASSURED",
    });
    expect((fetcher.mock.calls[0]?.[1]?.headers as Record<string, string>).Authorization).toBe(
      "Bearer restored-token",
    );
  });

  it("rejects a protected response crossed by another session generation", async () => {
    let sessionGeneration = 5;
    const auth = {
      ...authProvider(),
      getSessionGeneration: () => sessionGeneration,
    };
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      sessionGeneration += 1;
      return new Response(JSON.stringify({ state: "ASSURED" }), { status: 200 });
    });
    const api = new DashboardApiClient({ auth, fetch: fetcher });

    await expect(api.request("/state", staffMfaStateResponseSchema)).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("never blindly replays a mutation after a 401", async () => {
    const auth = authProvider();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: "STAFF_AUTHENTICATION_FAILED", message: "expired", requestId: "req-2" }), { status: 401 }),
    );
    const api = new DashboardApiClient({ auth, fetch: fetcher });

    await expect(
      api.request("/write", staffMfaStateResponseSchema, { method: "POST", body: {} }),
    ).rejects.toMatchObject({ kind: "auth" } satisfies Partial<DashboardApiError>);
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports schema-invalid successful responses as malformed", async () => {
    const api = new DashboardApiClient({
      auth: authProvider(),
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ state: "NOPE" }), { status: 200 })),
    });
    await expect(api.request("/state", staffMfaStateResponseSchema)).rejects.toMatchObject({ kind: "malformed" });
  });

  it("keeps error categories separate", () => {
    expect(dashboardApiErrorFromResponse(403, { code: "MFA_STEP_UP_REQUIRED", message: "mfa", requestId: "req-mfa" }).kind).toBe("mfa");
    expect(dashboardApiErrorFromResponse(403, { code: "DASHBOARD_ACCESS_DISABLED", message: "plan", requestId: "req-plan" }).kind).toBe("entitlement");
    expect(dashboardApiErrorFromResponse(403, { code: "FORBIDDEN", message: "no", requestId: "req-no" }).kind).toBe("authorization");
    expect(dashboardApiErrorFromResponse(404, {}).kind).toBe("authorization");
    expect(dashboardApiErrorFromResponse(400, {}).kind).toBe("validation");
    expect(dashboardApiErrorFromResponse(409, {}).kind).toBe("conflict");
  });
});
