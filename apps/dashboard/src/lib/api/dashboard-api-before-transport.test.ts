import { staffMfaStateResponseSchema } from "@valet/contracts";
import { describe, expect, it, vi } from "vitest";

import { DashboardApiClient } from "./dashboard-api-client";

const accessPayload = {
  accessToken: `vsa1.${"a".repeat(43)}`,
  tokenType: "Bearer" as const,
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  sessionExpiresAt: "2099-02-01T00:00:00.000Z",
};

describe("DashboardApiClient scoped pre-transport authority", () => {
  it("does not send GET after deferred auth refresh retires its owner", async () => {
    let finishRefresh!: () => void;
    const pendingRefresh = new Promise<void>((resolve) => {
      finishRefresh = resolve;
    });
    let generation = 10;
    const auth = {
      getAccessToken: () => "old-token",
      getIdentityGeneration: () => 4,
      getSessionGeneration: () => generation,
      isTokenFresh: () => false,
      refresh: vi.fn(async () => {
        await pendingRefresh;
        generation += 1;
        return accessPayload;
      }),
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ state: "ASSURED" }), { status: 200 }),
      );
    const api = new DashboardApiClient({ auth, fetch: fetcher });
    const ownerSession = generation;
    const read = api.request("/scope-sensitive", staffMfaStateResponseSchema, {
      beforeTransport: () => generation === ownerSession,
    });
    await Promise.resolve();
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    finishRefresh();
    await expect(read).rejects.toMatchObject({ kind: "auth" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not replay a scoped GET after a 401 triggers auth refresh", async () => {
    let generation = 2;
    const auth = {
      getAccessToken: () => "old-token",
      getIdentityGeneration: () => 4,
      getSessionGeneration: () => generation,
      isTokenFresh: () => true,
      refresh: vi.fn(async () => {
        generation += 1;
        return accessPayload;
      }),
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "STAFF_AUTHENTICATION_FAILED",
          message: "expired",
          requestId: "req-scope",
        }),
        { status: 401 },
      ),
    );
    const api = new DashboardApiClient({ auth, fetch: fetcher });
    const ownerSession = generation;
    await expect(
      api.request("/scoped", staffMfaStateResponseSchema, {
        beforeTransport: () => generation === ownerSession,
      }),
    ).rejects.toMatchObject({ kind: "auth" });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
