import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  EmployeePushManager,
  type EmployeePushApi,
  type EmployeePushRuntime,
  type EmployeePushStorage,
} from "./employee-push-manager";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_KEY = Buffer.concat([
  Buffer.from([4]),
  Buffer.alloc(64, 7),
]).toString("base64url");

function subscription(endpoint = "https://push.example.test/device") {
  return {
    endpoint,
    expirationTime: null,
    getKey: (name: PushEncryptionKeyName) =>
      name === "auth"
        ? Uint8Array.from({ length: 16 }, (_, index) => index + 1).buffer
        : Uint8Array.from(
            Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]),
          ).buffer,
    options: { applicationServerKey: null, userVisibleOnly: true },
    toJSON: () => ({}),
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function setup(
  options: {
    existing?: PushSubscription | null;
    permission?: NotificationPermission;
    serverId?: string | null;
  } = {},
) {
  let current = options.existing ?? null;
  const created = subscription("https://push.example.test/fresh");
  const runtime: EmployeePushRuntime = {
    capability: vi.fn(() => ({
      isIosLike: false,
      isStandalone: false,
      notification: true,
      permission: options.permission ?? "granted",
      pushManager: true,
      serviceWorker: true,
    })),
    getSubscription: vi.fn(async () => current),
    requestPermission: vi.fn(
      async (): Promise<NotificationPermission> => "granted",
    ),
    subscribe: vi.fn(async (input) => {
      expect(input.userVisibleOnly).toBe(true);
      expect(input.applicationServerKey).toEqual(
        Uint8Array.from(Buffer.from(PUBLIC_KEY, "base64url")),
      );
      current = created;
      return created;
    }),
  };
  const api: EmployeePushApi = {
    create: vi.fn().mockResolvedValue({ id: SERVER_ID }),
    disable: vi.fn().mockResolvedValue(undefined),
    replace: vi.fn().mockResolvedValue({ id: SERVER_ID }),
  };
  let stored = options.serverId ?? null;
  const storage: EmployeePushStorage = {
    clear: vi.fn(() => {
      stored = null;
    }),
    read: vi.fn(() => stored),
    write: vi.fn((id) => {
      stored = id;
    }),
  };
  const manager = new EmployeePushManager({
    api,
    config: { enabled: true, vapidPublicKey: PUBLIC_KEY },
    runtime,
    storage,
  });
  return { api, created, manager, runtime, storage };
}

beforeEach(() => vi.clearAllMocks());

describe("Employee Web Push reconciliation", () => {
  it("does not register or inspect a worker when Web Push is disabled", async () => {
    const subject = setup();
    const manager = new EmployeePushManager({
      api: subject.api,
      config: { enabled: false },
      runtime: subject.runtime,
      storage: subject.storage,
    });
    await expect(manager.reconcile("en")).resolves.toBe("UNAVAILABLE");
    await manager.cleanupBeforeLogout();
    expect(subject.runtime.getSubscription).not.toHaveBeenCalled();
  });

  it("never requests permission during initial lifecycle reconciliation", async () => {
    const subject = setup({ permission: "default" });
    await expect(subject.manager.reconcile("en")).resolves.toBe(
      "PROMPT_AVAILABLE",
    );
    expect(subject.runtime.requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission exactly once after an explicit action", async () => {
    const subject = setup({ permission: "default" });
    await subject.manager.reconcile("en");
    await subject.manager.enable("en");
    expect(subject.runtime.requestPermission).toHaveBeenCalledOnce();
    expect(subject.api.create).toHaveBeenCalledOnce();
  });

  it("does not repeatedly prompt after permission is denied", async () => {
    const subject = setup({ permission: "denied" });
    await subject.manager.reconcile("en");
    await subject.manager.enable("en");
    expect(subject.runtime.requestPermission).not.toHaveBeenCalled();
  });

  it("creates and registers a missing browser subscription with only T2 fields", async () => {
    const subject = setup();
    await subject.manager.reconcile("ar");
    expect(subject.api.create).toHaveBeenCalledWith({
      auth: "AQIDBAUGBwgJCgsMDQ4PEA",
      browserExpiresAt: null,
      endpoint: "https://push.example.test/fresh",
      locale: "ar",
      p256dh: Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]).toString(
        "base64url",
      ),
    });
  });

  it("refreshes the same server binding across token rotation and locale change", async () => {
    const existing = subscription();
    const subject = setup({ existing, serverId: SERVER_ID });
    await subject.manager.reconcile("en");
    await subject.manager.reconcile("ar");
    expect(existing.unsubscribe).not.toHaveBeenCalled();
    expect(subject.api.create).not.toHaveBeenCalled();
    expect(subject.api.replace).toHaveBeenLastCalledWith(
      SERVER_ID,
      expect.objectContaining({ locale: "ar" }),
    );
  });

  it("serializes overlapping locale refreshes so the latest locale wins", async () => {
    const existing = subscription();
    const subject = setup({ existing, serverId: SERVER_ID });
    let releaseFirst: (() => void) | undefined;
    vi.mocked(subject.api.replace)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => resolve({ id: SERVER_ID });
          }),
      )
      .mockResolvedValue({ id: SERVER_ID });
    const english = subject.manager.reconcile("en");
    const arabic = subject.manager.reconcile("ar");
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    expect(subject.api.replace).toHaveBeenCalledOnce();
    releaseFirst?.();
    await Promise.all([english, arabic]);
    expect(subject.api.replace).toHaveBeenLastCalledWith(
      SERVER_ID,
      expect.objectContaining({ locale: "ar" }),
    );
  });

  it("does not silently transfer an untracked existing endpoint on fresh login", async () => {
    const old = subscription("https://push.example.test/old-owner");
    const subject = setup({ existing: old, serverId: null });
    await subject.manager.reconcile("en");
    expect(old.unsubscribe).toHaveBeenCalledOnce();
    expect(subject.runtime.subscribe).toHaveBeenCalledOnce();
    expect(subject.api.create).toHaveBeenCalledOnce();
  });

  it("keeps server conflicts bounded and non-disclosing", async () => {
    const subject = setup();
    vi.mocked(subject.api.create).mockRejectedValue(new Error("owner secret"));
    await expect(subject.manager.reconcile("en")).resolves.toBe(
      "RECOVERABLE_ERROR",
    );
    expect(subject.manager.guidance()).not.toContain("owner secret");
  });

  it("attempts both server and browser cleanup without throwing", async () => {
    const existing = subscription();
    const subject = setup({ existing, serverId: SERVER_ID });
    vi.mocked(subject.api.disable).mockRejectedValue(new Error("offline"));
    vi.mocked(existing.unsubscribe).mockRejectedValue(new Error("browser"));
    await expect(
      subject.manager.cleanupBeforeLogout(),
    ).resolves.toBeUndefined();
    expect(subject.api.disable).toHaveBeenCalledWith(SERVER_ID);
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    expect(subject.storage.clear).toHaveBeenCalled();
  });
});
