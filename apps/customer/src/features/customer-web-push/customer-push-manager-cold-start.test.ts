import { describe, expect, it, vi } from "vitest";

import { GuestApiError } from "../../lib/api/api-error";
import { CustomerPushManager } from "./customer-push-manager";

const OLD_ID = "11111111-1111-4111-8111-111111111111";
const NEW_ID = "22222222-2222-4222-8222-222222222222";
const KEY = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString(
  "base64url",
);

function subscription(endpoint: string) {
  return {
    endpoint,
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

function apiError(status: number, code: string, isNetworkError = false) {
  return new GuestApiError({
    code,
    isNetworkError,
    message: "Push unavailable.",
    status,
  });
}

function subject() {
  const existing = subscription("https://push.example.test/old-device");
  const fresh = subscription("https://push.example.test/fresh-device");
  const replacement = subscription(
    "https://push.example.test/replacement-device",
  );
  const api = {
    create: vi.fn().mockResolvedValue({ id: NEW_ID }),
    disable: vi.fn().mockResolvedValue({ id: OLD_ID }),
    replace: vi.fn().mockResolvedValue({ id: OLD_ID }),
  };
  let browser: PushSubscription | null = existing;
  let storedId: string | null = OLD_ID;
  let subscribeCount = 0;
  const runtime = {
    capability: vi.fn(() => ({
      isIosLike: false,
      isStandalone: false,
      notification: true,
      permission: "granted" as NotificationPermission,
      pushManager: true,
      serviceWorker: true,
    })),
    getSubscription: vi.fn(async () => browser),
    requestPermission: vi.fn().mockResolvedValue("granted"),
    subscribe: vi.fn(async () => {
      subscribeCount += 1;
      browser = subscribeCount === 1 ? fresh : replacement;
      return browser;
    }),
  };
  const storage = {
    clear: vi.fn(() => {
      storedId = null;
    }),
    read: vi.fn(() => storedId),
    write: vi.fn((id: string) => {
      storedId = id;
    }),
  };
  return {
    api,
    existing,
    fresh,
    manager: new CustomerPushManager({
      api,
      config: { enabled: true, vapidPublicKey: KEY },
      runtime,
      storage,
    }),
    replacement,
    runtime,
    storedId: () => storedId,
    storage,
  };
}

describe("CustomerPushManager cold-start reconciliation", () => {
  it("retains a cold-start subscription when the server proves the same context", async () => {
    const item = subject();

    await expect(item.manager.reconcile("en")).resolves.toBe("SUBSCRIBED");

    expect(item.api.replace).toHaveBeenCalledWith(
      OLD_ID,
      expect.objectContaining({ endpoint: item.existing.endpoint }),
    );
    expect(item.existing.unsubscribe).not.toHaveBeenCalled();
    expect(item.runtime.subscribe).not.toHaveBeenCalled();
    expect(item.api.create).not.toHaveBeenCalled();
  });

  it("recovers a 404 stale hint through unsubscribe, fresh subscribe, and POST", async () => {
    const item = subject();
    item.api.replace.mockRejectedValueOnce(apiError(404, "REQUEST_FAILED"));

    await expect(item.manager.reconcile("ar")).resolves.toBe("SUBSCRIBED");

    expect(item.storage.clear).toHaveBeenCalledOnce();
    expect(item.existing.unsubscribe).toHaveBeenCalledOnce();
    expect(item.runtime.subscribe).toHaveBeenCalledWith({
      applicationServerKey: expect.any(Uint8Array),
      userVisibleOnly: true,
    });
    expect(item.api.create).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: item.fresh.endpoint, locale: "ar" }),
    );
    expect(item.storage.write).toHaveBeenLastCalledWith(NEW_ID);
    expect(item.storedId()).toBe(NEW_ID);
  });

  it("does not POST when the stale browser subscription cannot unsubscribe", async () => {
    const item = subject();
    item.api.replace.mockRejectedValueOnce(
      apiError(404, "WEB_PUSH_SUBSCRIPTION_NOT_AVAILABLE"),
    );
    vi.mocked(item.existing.unsubscribe).mockResolvedValueOnce(false);

    await expect(item.manager.reconcile("en")).resolves.toBe(
      "RECOVERABLE_ERROR",
    );

    expect(item.storage.clear).toHaveBeenCalledOnce();
    expect(item.runtime.subscribe).not.toHaveBeenCalled();
    expect(item.api.create).not.toHaveBeenCalled();
    expect(item.storedId()).toBeNull();
  });

  it.each([
    [409, "WEB_PUSH_SUBSCRIPTION_CONFLICT"],
    [401, "GUEST_ACCESS_INVALID"],
    [500, "SERVICE_UNAVAILABLE"],
    [0, "NETWORK_ERROR"],
    [404, "UNKNOWN_ERROR"],
  ])(
    "keeps the endpoint intact for non-stale replace failure %i %s",
    async (status, code) => {
      const item = subject();
      item.api.replace.mockRejectedValueOnce(
        apiError(status, code, status === 0),
      );

      await expect(item.manager.reconcile("en")).resolves.toBe(
        "RECOVERABLE_ERROR",
      );

      expect(item.storage.clear).not.toHaveBeenCalled();
      expect(item.existing.unsubscribe).not.toHaveBeenCalled();
      expect(item.runtime.subscribe).not.toHaveBeenCalled();
      expect(item.api.create).not.toHaveBeenCalled();
      expect(item.storedId()).toBe(OLD_ID);
    },
  );

  it("keeps the stale hint cleared and applies unknown-endpoint recovery after POST failure", async () => {
    const item = subject();
    item.api.replace.mockRejectedValueOnce(
      apiError(404, "WEB_PUSH_SUBSCRIPTION_NOT_AVAILABLE"),
    );
    item.api.create.mockRejectedValueOnce(apiError(500, "SERVICE_UNAVAILABLE"));

    await expect(item.manager.reconcile("en")).resolves.toBe(
      "RECOVERABLE_ERROR",
    );
    expect(item.storedId()).toBeNull();

    await expect(item.manager.reconcile("en")).resolves.toBe("SUBSCRIBED");
    expect(item.fresh.unsubscribe).toHaveBeenCalledOnce();
    expect(item.runtime.subscribe).toHaveBeenCalledTimes(2);
    expect(item.api.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: item.replacement.endpoint }),
    );
    expect(item.storedId()).toBe(NEW_ID);
  });
});
