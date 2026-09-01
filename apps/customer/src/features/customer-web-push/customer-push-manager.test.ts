import { describe, expect, it, vi } from "vitest";

import { CustomerPushManager } from "./customer-push-manager";

const ID = "11111111-1111-4111-8111-111111111111";
const KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString(
  "base64url",
);

function subscription() {
  return {
    endpoint: "https://push.example.test/device",
    expirationTime: null,
    getKey: (name: string) =>
      name === "auth"
        ? Uint8Array.from({ length: 16 }, (_, index) => index + 1).buffer
        : Uint8Array.from(
            Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]),
          ).buffer,
    unsubscribe: vi.fn().mockResolvedValue(true),
  } as unknown as PushSubscription;
}

function subject(existing: PushSubscription | null, storedId: string | null) {
  const created = subscription();
  const api = {
    create: vi.fn().mockResolvedValue({ id: ID }),
    disable: vi.fn().mockResolvedValue({ id: ID }),
    replace: vi.fn().mockResolvedValue({ id: ID }),
  };
  const runtime = {
    capability: vi.fn(() => ({
      isIosLike: false,
      isStandalone: false,
      notification: true,
      permission: "granted" as NotificationPermission,
      pushManager: true,
      serviceWorker: true,
    })),
    getSubscription: vi.fn().mockResolvedValue(existing),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    subscribe: vi.fn().mockResolvedValue(created),
  };
  let value = storedId;
  const storage = {
    clear: vi.fn(() => {
      value = null;
    }),
    read: vi.fn(() => value),
    write: vi.fn((id: string) => {
      value = id;
    }),
  };
  return {
    api,
    created,
    manager: new CustomerPushManager({
      api,
      config: { enabled: true, vapidPublicKey: KEY },
      runtime,
      storage,
    }),
    runtime,
    storage,
  };
}

describe("CustomerPushManager", () => {
  it("never asks permission during reconciliation", async () => {
    const item = subject(null, null);
    item.runtime.capability.mockReturnValue({
      ...item.runtime.capability(),
      permission: "default",
    });
    await expect(item.manager.reconcile("en")).resolves.toBe(
      "PROMPT_AVAILABLE",
    );
    expect(item.runtime.requestPermission).not.toHaveBeenCalled();
  });

  it("shows iOS Home Screen guidance without requesting permission in browser mode", async () => {
    const item = subject(null, null);
    item.runtime.capability.mockReturnValue({
      ...item.runtime.capability(),
      isIosLike: true,
      isStandalone: false,
      permission: "default",
    });
    await expect(item.manager.enable("en")).resolves.toBe(
      "IOS_REQUIRES_HOME_SCREEN",
    );
    expect(item.runtime.requestPermission).not.toHaveBeenCalled();
  });

  it("does not require standalone display mode on other capable mobile browsers", async () => {
    const item = subject(null, null);
    item.runtime.capability.mockReturnValue({
      ...item.runtime.capability(),
      isIosLike: false,
      isStandalone: false,
      permission: "default",
    });
    await expect(item.manager.enable("en")).resolves.toBe("SUBSCRIBED");
    expect(item.runtime.requestPermission).toHaveBeenCalledOnce();
  });

  it("subscribes only after an explicit enable action with the public key", async () => {
    const item = subject(null, null);
    item.runtime.capability.mockReturnValue({
      ...item.runtime.capability(),
      permission: "default",
    });
    await expect(item.manager.enable("en")).resolves.toBe("SUBSCRIBED");
    expect(item.runtime.requestPermission).toHaveBeenCalledOnce();
    expect(item.runtime.subscribe).toHaveBeenCalledWith({
      applicationServerKey: expect.any(Uint8Array),
      userVisibleOnly: true,
    });
    expect(item.api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        endpoint: "https://push.example.test/device",
      }),
    );
    expect(item.api.create.mock.calls[0]?.[0]).not.toHaveProperty(
      "valetSessionId",
    );
    expect(item.api.create.mock.calls[0]?.[0]).not.toHaveProperty("generation");
  });

  it("unsubscribes an unknown existing endpoint before creating a fresh binding", async () => {
    const existing = subscription();
    const item = subject(existing, null);
    await expect(item.manager.reconcile("ar")).resolves.toBe("SUBSCRIBED");
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    expect(item.runtime.subscribe).toHaveBeenCalledOnce();
    expect(item.api.create).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "ar" }),
    );
  });

  it("refreshes a known exact binding without permission re-prompt or duplicate endpoint", async () => {
    const existing = subscription();
    const item = subject(existing, ID);
    await expect(item.manager.reconcile("ar")).resolves.toBe("SUBSCRIBED");
    expect(item.api.replace).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ locale: "ar" }),
    );
    expect(item.runtime.requestPermission).not.toHaveBeenCalled();
    expect(item.runtime.subscribe).not.toHaveBeenCalled();
  });

  it("keeps an active-owner conflict non-disclosing and never rebinds", async () => {
    const existing = subscription();
    const item = subject(existing, ID);
    item.api.replace.mockRejectedValueOnce(new Error("conflict"));
    await expect(item.manager.reconcile("en")).resolves.toBe(
      "RECOVERABLE_ERROR",
    );
    expect(item.api.create).not.toHaveBeenCalled();
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });

  it("best-effort disables and unsubscribes before a new in-memory Guest context", async () => {
    const existing = subscription();
    const item = subject(existing, ID);
    await expect(item.manager.cleanupCurrentContext()).resolves.toBeUndefined();
    expect(item.api.disable).toHaveBeenCalledWith(ID);
    expect(existing.unsubscribe).toHaveBeenCalledOnce();
    expect(item.storage.clear).toHaveBeenCalled();
  });

  it("does not persist a binding when current GuestAccess is rejected by the server", async () => {
    const item = subject(null, null);
    item.api.create.mockRejectedValueOnce(new Error("guest access invalid"));
    await expect(item.manager.reconcile("en")).resolves.toBe(
      "RECOVERABLE_ERROR",
    );
    expect(item.storage.write).not.toHaveBeenCalled();
  });
});
