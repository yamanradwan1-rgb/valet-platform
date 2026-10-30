import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffAuthClient, StaffAuthRefreshError } from "./staff-auth-client";

const logoutMarker = "vaylet_staff_logout_unconfirmed";
const credentials = { email: "admin@example.com", password: "secret" };
const authPayload = {
  accessToken: `vsa1.${"a".repeat(43)}`,
  tokenType: "Bearer",
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  sessionExpiresAt: "2099-02-01T00:00:00.000Z",
};
const authResponse = () => Response.json(authPayload);
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

type StorageAccess = "writable" | "read-denied" | "write-denied" | "remove-denied" | "missing";

function installStorage(access: StorageAccess, values = new Map<string, string>()) {
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  if (access === "missing") {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: undefined });
    return values;
  }
  const storage = {
    getItem(key: string) {
      if (access === "read-denied") throw new DOMException("Access denied", "SecurityError");
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (access === "write-denied") throw new DOMException("Access denied", "SecurityError");
      values.set(key, value);
    },
    removeItem(key: string) {
      if (access === "write-denied" || access === "remove-denied") throw new DOMException("Access denied", "SecurityError");
      values.delete(key);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  return values;
}

afterEach(() => {
  for (const [name, descriptor] of [
    ["localStorage", previousStorage],
    ["window", previousWindow],
  ] as const) {
    if (descriptor === undefined) delete (globalThis as Record<string, unknown>)[name];
    else Object.defineProperty(globalThis, name, descriptor);
  }
  vi.restoreAllMocks();
});

describe("Dashboard fail-closed bootstrap", () => {
  it.each<StorageAccess>(["read-denied", "write-denied", "remove-denied", "missing"])(
    "rejects silent refresh without browser storage: %s",
    async (access) => {
      installStorage(access);
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(authResponse());
      const client = new StaffAuthClient({ fetch: fetcher });
      expect(client.canRestoreSessionFromCookie()).toBe(false);
      await expect(client.refresh()).rejects.toBeInstanceOf(StaffAuthRefreshError);
      expect(fetcher).not.toHaveBeenCalled();
      expect(client.getSession()).toBeNull();
    },
  );

  it("allows existing cookie refresh with writable storage and no logout marker", async () => {
    installStorage("writable");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(authResponse());
    const client = new StaffAuthClient({ fetch: fetcher });
    expect(client.canRestoreSessionFromCookie()).toBe(true);
    await expect(client.refresh()).resolves.toEqual(authPayload);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("explicit login can replace an old marker when deletion alone is denied", async () => {
    const values = installStorage("remove-denied", new Map([[logoutMarker, "1"]]));
    const client = new StaffAuthClient({ fetch: vi.fn<typeof fetch>(async () => authResponse()) });
    await client.login(credentials);
    expect(values.get(logoutMarker)).toBe("0");
    expect(client.getAccessToken()).toBe(authPayload.accessToken);
    await expect(client.refresh()).resolves.toEqual(authPayload);
  });

  it.each(["storage-denied", "cross-tab-logout-marker"])(
    "does not apply a late bootstrap refresh after %s",
    async (change) => {
      const values = installStorage("writable");
      let resolveRefresh!: (response: Response) => void;
      const pending = new Promise<Response>((done) => { resolveRefresh = done; });
      const client = new StaffAuthClient({
        fetch: vi.fn<typeof fetch>().mockReturnValue(pending),
      });
      const refresh = client.refresh();
      if (change === "storage-denied") installStorage("read-denied");
      else values.set(logoutMarker, "1");
      resolveRefresh(authResponse());
      await expect(refresh).rejects.toBeInstanceOf(StaffAuthRefreshError);
      expect(client.getSession()).toBeNull();
    },
  );

  it("requires explicit login on a new runtime after unknown logout outcome", async () => {
    installStorage("read-denied");
    const fetcher = vi.fn<typeof fetch>(async (path) => {
      if (String(path).endsWith("/logout")) throw new TypeError("connection reset");
      return authResponse();
    });
    const original = new StaffAuthClient({ fetch: fetcher });
    await original.login(credentials);
    await expect(original.logout()).rejects.toMatchObject({ kind: "network" });

    const fresh = new StaffAuthClient({ fetch: fetcher });
    const requestsBefore = fetcher.mock.calls.length;
    expect(fresh.canRestoreSessionFromCookie()).toBe(false);
    await expect(fresh.refresh()).rejects.toBeInstanceOf(StaffAuthRefreshError);
    expect(fetcher).toHaveBeenCalledTimes(requestsBefore);
    await fresh.login(credentials);
    expect(fresh.getSession()).not.toBeNull();
    await expect(fresh.refresh()).resolves.toEqual(authPayload);
  });

  it("prevents another tab from restoring after a failed logout with writable storage", async () => {
    const values = installStorage("writable");
    const fetcher = vi.fn<typeof fetch>(async (path) => {
      if (String(path).endsWith("/logout")) throw new TypeError("offline");
      return authResponse();
    });
    const firstTab = new StaffAuthClient({ fetch: fetcher });
    await firstTab.login(credentials);
    await expect(firstTab.logout()).rejects.toMatchObject({ kind: "network" });
    expect(values.get(logoutMarker)).toBe("1");

    const secondTab = new StaffAuthClient({ fetch: fetcher });
    expect(secondTab.hasUnconfirmedLogout()).toBe(true);
    await expect(secondTab.refresh()).rejects.toBeInstanceOf(StaffAuthRefreshError);
    await secondTab.login(credentials);
    expect(values.has(logoutMarker)).toBe(false);
    await expect(secondTab.refresh()).resolves.toEqual(authPayload);
  });

  it("invalidates an already authenticated tab before another API bearer request", async () => {
    installStorage("writable");
    const fetcher = vi.fn<typeof fetch>(async (path) => {
      if (String(path).endsWith("/logout")) throw new TypeError("offline");
      return authResponse();
    });
    const firstTab = new StaffAuthClient({ fetch: fetcher });
    const secondTab = new StaffAuthClient({ fetch: fetcher });
    await firstTab.login(credentials);
    await secondTab.login(credentials);
    const identityBefore = secondTab.getIdentityGeneration();
    await expect(firstTab.logout()).rejects.toMatchObject({ kind: "network" });

    expect(secondTab.getAccessToken()).toBeNull();
    expect(secondTab.hasUnconfirmedLogout()).toBe(true);
    expect(secondTab.getIdentityGeneration()).toBeGreaterThan(identityBefore);
    const requestsBefore = fetcher.mock.calls.length;
    await expect(secondTab.refresh()).rejects.toBeInstanceOf(StaffAuthRefreshError);
    expect(fetcher).toHaveBeenCalledTimes(requestsBefore);

    await secondTab.login(credentials);
    expect(secondTab.getAccessToken()).toBe(authPayload.accessToken);
  });

  it("fences an already running refresh after a cross-tab logout marker", async () => {
    const values = installStorage("writable");
    let resolveRefresh!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolveRefresh = done; });
    const fetcher = vi.fn<typeof fetch>(async (path) =>
      String(path).endsWith("/refresh") ? pending : authResponse(),
    );
    const tab = new StaffAuthClient({ fetch: fetcher });
    await tab.login(credentials);
    const refresh = tab.refresh();
    values.set(logoutMarker, "1");
    tab.observeExternalLogout();
    resolveRefresh(authResponse());
    await expect(refresh).rejects.toBeInstanceOf(StaffAuthRefreshError);
    expect(tab.getSession()).toBeNull();
    expect(tab.hasUnconfirmedLogout()).toBe(true);
  });

  it("successful server logout clears the marker and preserves refresh capability", async () => {
    const values = installStorage("writable");
    const fetcher = vi.fn<typeof fetch>(async (path) =>
      String(path).endsWith("/logout")
        ? new Response(null, { status: 204 })
        : authResponse(),
    );
    const client = new StaffAuthClient({ fetch: fetcher });
    await client.login(credentials);
    await client.logout();
    expect(values.has(logoutMarker)).toBe(false);
    expect(client.getSession()).toBeNull();
    await expect(new StaffAuthClient({ fetch: fetcher }).refresh()).resolves.toEqual(authPayload);
  });
});
