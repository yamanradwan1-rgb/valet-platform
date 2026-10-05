import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardApiError } from "../api/dashboard-api-error";
import { StaffAuthClient, StaffAuthRefreshError } from "./staff-auth-client";

const token = (character: string) => `vsa1.${character.repeat(43)}`;
const authPayload = (character: string) => ({
  accessToken: token(character),
  tokenType: "Bearer" as const,
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  sessionExpiresAt: "2099-02-01T00:00:00.000Z",
  staffAuthSessionId: "88888888-8888-4888-8888-888888888888",
});

const storageValues = new Map<string, string>();
const storageGet = vi.fn((key: string) => storageValues.get(key) ?? null);
const storageSet = vi.fn((key: string, value: string) => storageValues.set(key, value));
const storageRemove = vi.fn((key: string) => storageValues.delete(key));
const originalLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

function installStorageSpies(): void {
  const storage = { getItem: storageGet, setItem: storageSet, removeItem: storageRemove };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
}

function restoreStorage(): void {
  for (const [key, descriptor] of [
    ["localStorage", originalLocal],
    ["sessionStorage", originalSession],
  ] as const) {
    if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[key];
    else Object.defineProperty(globalThis, key, descriptor);
  }
  storageValues.clear();
  storageGet.mockClear();
  storageSet.mockReset();
  storageRemove.mockClear();
}

afterEach(() => {
  restoreStorage();
  vi.restoreAllMocks();
});

describe("StaffAuthClient", () => {
  it("uses cookie transport, keeps credentials in memory, and fences session vs identity generations", async () => {
    installStorageSpies();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(authPayload("a")), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(authPayload("b")), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new StaffAuthClient({ fetch: fetcher });

    await client.login({ email: "Admin@Example.com", password: "secret" });
    expect(client.getSessionGeneration()).toBe(1);
    expect(client.getIdentityGeneration()).toBe(1);
    expect(client.getAccessToken()).toBe(token("a"));

    await client.refresh();
    expect(client.getSessionGeneration()).toBe(2);
    expect(client.getIdentityGeneration()).toBe(1);
    expect(client.getAccessToken()).toBe(token("b"));

    await client.logout();
    expect(client.getSession()).toBeNull();
    expect(client.getSessionGeneration()).toBe(3);
    expect(client.getIdentityGeneration()).toBe(2);
    expect(storageSet).toHaveBeenCalledWith("vaylet_staff_logout_unconfirmed", "1");
    expect(storageRemove).toHaveBeenCalledWith("vaylet_staff_logout_unconfirmed");
    expect([...storageValues.values()]).not.toContain(token("a"));
    expect([...storageValues.values()]).not.toContain(token("b"));
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.credentials).toBe("include");
      expect(init?.cache).toBe("no-store");
    }
  });

  it("single-flights concurrent refresh callers", async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => {
      resolve = done;
    });
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(pending);
    const client = new StaffAuthClient({ fetch: fetcher });

    const first = client.refresh();
    const second = client.refresh();
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify(authPayload("c")), { status: 200 }));

    await expect(first).resolves.toMatchObject({ accessToken: token("c") });
    await expect(second).resolves.toMatchObject({ accessToken: token("c") });
    expect(client.getSessionGeneration()).toBe(1);
    expect(client.getIdentityGeneration()).toBe(1);
  });

  it("clears immediately on logout and a late refresh cannot resurrect the session", async () => {
    let resolveRefresh!: (response: Response) => void;
    let resolveLogout!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((done) => {
      resolveRefresh = done;
    });
    const logoutResponse = new Promise<Response>((done) => {
      resolveLogout = done;
    });
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const path = String(url);
      if (path.endsWith("/login")) return new Response(JSON.stringify(authPayload("d")), { status: 200 });
      if (path.endsWith("/refresh")) return refreshResponse;
      return logoutResponse;
    });
    const client = new StaffAuthClient({ fetch: fetcher });
    await client.login({ email: "admin@example.com", password: "secret" });

    const refresh = client.refresh();
    const logout = client.logout();
    expect(client.getSession()).toBeNull();

    resolveRefresh(new Response(JSON.stringify(authPayload("e")), { status: 200 }));
    await expect(refresh).rejects.toBeInstanceOf(StaffAuthRefreshError);
    expect(client.getSession()).toBeNull();
    resolveLogout(new Response(null, { status: 204 }));
    await expect(logout).resolves.toBeUndefined();
  });

  it("keeps a failed logout fail-closed until an authoritative retry succeeds", async () => {
    installStorageSpies();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(authPayload("g")), { status: 200 }))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new StaffAuthClient({ fetch: fetcher });
    await client.login({ email: "admin@example.com", password: "secret" });

    await expect(client.logout()).rejects.toMatchObject({ kind: "network" });
    expect(client.getSession()).toBeNull();
    expect(client.hasUnconfirmedLogout()).toBe(true);
    expect(storageValues.get("vaylet_staff_logout_unconfirmed")).toBe("1");

    const reloadedClient = new StaffAuthClient({ fetch: fetcher });
    expect(reloadedClient.hasUnconfirmedLogout()).toBe(true);
    await expect(reloadedClient.logout()).resolves.toBeUndefined();
    expect(reloadedClient.hasUnconfirmedLogout()).toBe(false);
    expect(storageValues.has("vaylet_staff_logout_unconfirmed")).toBe(false);
  });

  it("treats malformed successful auth responses as malformed without storing them", async () => {
    const client = new StaffAuthClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ accessToken: "not-a-token" }), { status: 200 }),
      ),
    });
    await expect(
      client.login({ email: "admin@example.com", password: "secret" }),
    ).rejects.toMatchObject({ kind: "malformed" } satisfies Partial<DashboardApiError>);
    expect(client.getSession()).toBeNull();
  });

  it("keeps a prior session on transient refresh failure but clears it on definitive rejection", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(authPayload("f")), { status: 200 }))
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "STAFF_AUTHENTICATION_FAILED", message: "Denied", requestId: "req-1" }), { status: 401 }));
    const client = new StaffAuthClient({ fetch: fetcher });
    await client.login({ email: "admin@example.com", password: "secret" });

    await expect(client.refresh()).rejects.toMatchObject({ kind: "transient" });
    expect(client.getSession()).not.toBeNull();
    await expect(client.refresh()).rejects.toMatchObject({ kind: "definitive" });
    expect(client.getSession()).toBeNull();
  });
});
