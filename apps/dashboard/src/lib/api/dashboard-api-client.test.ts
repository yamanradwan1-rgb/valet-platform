import { staffMfaStateResponseSchema } from "@valet/contracts";
import { describe, expect, it, vi } from "vitest";

import { DashboardApiClient } from "./dashboard-api-client";
import { DashboardApiError, dashboardApiErrorFromResponse } from "./dashboard-api-error";
import { StaffAuthClient } from "../auth/staff-auth-client";

const accessPayload = (character: string) => ({
  accessToken: `vsa1.${character.repeat(43)}`,
  tokenType: "Bearer" as const,
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  sessionExpiresAt: "2099-02-01T00:00:00.000Z",
});

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

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "reconciles a %s 401 without replaying the mutation",
    async (method) => {
    const auth = authProvider();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: "STAFF_AUTHENTICATION_FAILED", message: "expired", requestId: "req-2" }), { status: 401 }),
    );
    const api = new DashboardApiClient({ auth, fetch: fetcher });

    await expect(
      api.request("/write", staffMfaStateResponseSchema, { method, body: {} }),
    ).rejects.toMatchObject({
      kind: "auth",
      code: "AUTH_RECONCILED_RETRY_REQUIRED",
    } satisfies Partial<DashboardApiError>);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(auth.getSessionGeneration()).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it("clears identity when mutation reconciliation is definitively rejected", async () => {
    const authFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(accessPayload("a")), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            code: "STAFF_AUTHENTICATION_FAILED",
            message: "expired",
            requestId: "req-refresh",
          }),
          { status: 401 },
        ),
      );
    const auth = new StaffAuthClient({ fetch: authFetch });
    await auth.login({ email: "admin@example.com", password: "secret" });
    const identityBefore = auth.getIdentityGeneration();
    const apiFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "STAFF_AUTHENTICATION_FAILED",
          message: "expired",
          requestId: "req-write",
        }),
        { status: 401 },
      ),
    );
    const api = new DashboardApiClient({ auth, fetch: apiFetch });

    await expect(
      api.request("/write", staffMfaStateResponseSchema, {
        method: "POST",
        body: {},
      }),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(auth.getSession()).toBeNull();
    expect(auth.getIdentityGeneration()).toBe(identityBefore + 1);
  });

  it("keeps prior identity on transient mutation reconciliation failure", async () => {
    const authFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(accessPayload("b")), { status: 200 }))
      .mockResolvedValueOnce(new Response("offline", { status: 503 }));
    const auth = new StaffAuthClient({ fetch: authFetch });
    await auth.login({ email: "admin@example.com", password: "secret" });
    const identityBefore = auth.getIdentityGeneration();
    const apiFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "STAFF_AUTHENTICATION_FAILED",
          message: "expired",
          requestId: "req-write",
        }),
        { status: 401 },
      ),
    );
    const api = new DashboardApiClient({ auth, fetch: apiFetch });

    await expect(
      api.request("/write", staffMfaStateResponseSchema, {
        method: "PATCH",
        body: {},
      }),
    ).rejects.toMatchObject({ kind: "unknown" });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(auth.getSession()).not.toBeNull();
    expect(auth.getIdentityGeneration()).toBe(identityBefore);
  });

  it("single-flights concurrent mutation-401 reconciliation", async () => {
    let resolveRefresh!: (response: Response) => void;
    let markRefreshStarted!: () => void;
    const pendingRefresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshStarted = new Promise<void>((resolve) => {
      markRefreshStarted = resolve;
    });
    const authFetch = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith("/login")) {
        return new Response(JSON.stringify(accessPayload("c")), { status: 200 });
      }
      markRefreshStarted();
      return pendingRefresh;
    });
    const auth = new StaffAuthClient({ fetch: authFetch });
    await auth.login({ email: "admin@example.com", password: "secret" });
    const apiFetch = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          code: "STAFF_AUTHENTICATION_FAILED",
          message: "expired",
          requestId: "req-write",
        }),
        { status: 401 },
      ),
    );
    const api = new DashboardApiClient({ auth, fetch: apiFetch });

    const first = api.request("/write-a", staffMfaStateResponseSchema, {
      method: "POST",
      body: {},
    });
    const second = api.request("/write-b", staffMfaStateResponseSchema, {
      method: "DELETE",
    });
    await refreshStarted;
    expect(authFetch).toHaveBeenCalledTimes(2);
    resolveRefresh(
      new Response(JSON.stringify(accessPayload("d")), { status: 200 }),
    );

    const results = await Promise.allSettled([first, second]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(authFetch).toHaveBeenCalledTimes(2);
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
