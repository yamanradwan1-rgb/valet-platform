import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffAuthClient } from "./staff-auth-client";
import { restoreStaffSession } from "./staff-auth-recovery";

const TOKEN_A = "vsa1.0123456789012345678901234567890123456789012";
const TOKEN_B = "vsa1.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";
const LOGIN = { email: "worker@example.com", password: "Password123!" };
const KEY = "vaylet.staff.auth-boundary.v1";

function access(token = TOKEN_A): Response {
  return new Response(JSON.stringify({
    accessToken: token,
    tokenType: "Bearer",
    accessExpiresAt: "2028-01-21T03:00:00.000Z",
    sessionExpiresAt: "2028-02-21T03:00:00.000Z",
  }), { status: 200 });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Staff web failed-logout durable origin boundary", () => {
  const storage = new Map<string, string>();
  const listeners = new Set<(event: { key: string }) => void>();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    storage.clear();
    listeners.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
      addEventListener: (name: string, listener: (event: { key: string }) => void) => {
        if (name === "storage") listeners.add(listener);
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function loggedIn(): Promise<StaffAuthClient> {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(access());
    const client = new StaffAuthClient();
    await client.login(LOGIN);
    return client;
  }

  it("keeps non-secret pending intent after fetch rejection and suppresses cookie-backed reload", async () => {
    const client = await loggedIn();
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline"));

    await expect(client.logout()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(client.getSession()).toBeNull();
    expect(storage.get(KEY)).toMatch(/^pending:/);
    expect([...storage.values()].join(" ")).not.toContain(TOKEN_A);
    expect([...storage.values()].join(" ")).not.toContain(LOGIN.password);

    const reloaded = new StaffAuthClient();
    const refresh = vi.fn().mockResolvedValue(access(TOKEN_A));
    globalThis.fetch = refresh;
    expect(await restoreStaffSession(reloaded)).toEqual({ kind: "DEFINITIVE_INVALID" });
    await expect(reloaded.refresh()).rejects.toMatchObject({
      code: "STAFF_LOGOUT_PENDING",
      kind: "definitive",
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(reloaded.getAccessToken()).toBeNull();

    // A new deliberate sign-in, with new credentials, is the only recovery.
    globalThis.fetch = vi.fn().mockResolvedValueOnce(access(TOKEN_B));
    await reloaded.login({ email: "another@example.com", password: "AnotherPassword!" });
    expect(storage.get(KEY)).toMatch(/^signed-in:/);
    expect(reloaded.getAccessToken()).toBe(TOKEN_B);
    globalThis.fetch = vi.fn().mockResolvedValueOnce(access(TOKEN_B));
    expect((await reloaded.refresh()).accessToken).toBe(TOKEN_B);
  });

  it("refuses logout without clearing the visible identity if origin storage cannot persist intent", async () => {
    const client = await loggedIn();
    const original = storage.get(KEY);
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    globalThis.fetch = vi.fn();
    await expect(client.logout()).rejects.toThrow("quota exceeded");
    expect(client.getSession()?.accessToken).toBe(TOKEN_A);
    expect(storage.get(KEY)).toBe(original);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("refuses logout if browser persistence reports a write but loses the marker", async () => {
    const client = await loggedIn();
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {});
    globalThis.fetch = vi.fn();
    await expect(client.logout()).rejects.toThrow("not durably persisted");
    expect(client.getSession()?.accessToken).toBe(TOKEN_A);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("keeps successful server logout confirmed and does not re-bootstrap the old cookie", async () => {
    const client = await loggedIn();
    const calls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 204 });
    });
    await client.logout();
    expect(calls).toEqual(["/v1/staff/auth/logout"]);
    expect(storage.get(KEY)).toMatch(/^signed-out:/);
    const subsequent = new StaffAuthClient();
    expect((await restoreStaffSession(subsequent)).kind).toBe("DEFINITIVE_INVALID");
    expect(calls).toHaveLength(1);
  });

  it("rejects an older in-flight refresh after failed logout without reinstalling identity", async () => {
    const client = await loggedIn();
    const pendingRefresh = deferred<Response>();
    globalThis.fetch = vi.fn().mockImplementationOnce(
      () => pendingRefresh.promise,
    ).mockRejectedValueOnce(new TypeError("offline"));
    const refreshing = client.refresh();
    await expect(client.logout()).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    pendingRefresh.resolve(access(TOKEN_B));
    await expect(refreshing).rejects.toMatchObject({
      code: "STAFF_AUTH_EPOCH_CHANGED",
      kind: "definitive",
    });
    expect(client.getSession()).toBeNull();
  });

  it("invalidates an authenticated second tab before it can reuse old access credentials", async () => {
    const first = await loggedIn();
    const second = new StaffAuthClient();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(access(TOKEN_A));
    await second.refresh();
    expect(second.getAccessToken()).toBe(TOKEN_A);

    globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline"));
    await expect(first.logout()).rejects.toThrow();
    // Cross-tab events are async; every credential read also checks storage.
    expect(second.getAccessToken()).toBeNull();
    expect(second.getSession()).toBeNull();
    await expect(second.refresh()).rejects.toMatchObject({ code: "STAFF_LOGOUT_PENDING" });
  });

  it("rejects old login results after another tab signs out and keeps the newer marker", async () => {
    const first = await loggedIn();
    const second = new StaffAuthClient();
    const pendingLogin = deferred<Response>();
    globalThis.fetch = vi.fn().mockImplementationOnce(() => pendingLogin.promise)
      .mockRejectedValueOnce(new TypeError("offline"));
    const loggingIn = second.login(LOGIN);
    await expect(first.logout()).rejects.toThrow();
    pendingLogin.resolve(access(TOKEN_B));
    await expect(loggingIn).rejects.toThrow("authentication changed");
    expect(second.getSession()).toBeNull();
    expect(storage.get(KEY)).toMatch(/^pending:/);
  });

  it("does not let stale failed logout overwrite a newer interactive login", async () => {
    const old = await loggedIn();
    const next = new StaffAuthClient();
    const pendingLogout = deferred<Response>();
    globalThis.fetch = vi.fn().mockImplementationOnce(() => pendingLogout.promise)
      .mockResolvedValueOnce(access(TOKEN_B));
    const logout = old.logout();
    await next.login(LOGIN);
    expect(next.getAccessToken()).toBe(TOKEN_B);
    const loginMarker = storage.get(KEY);
    pendingLogout.resolve(new Response(null, { status: 204 }));
    await logout;
    expect(storage.get(KEY)).toBe(loginMarker);
  });
});
