import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { GuestWebPushStatusTransport } from "./guest-web-push-status";
import { readGuestWebPushStatus } from "./guest-web-push-status";
import { GuestWebPushDisabledError } from "./guest-web-push-client";

const endpoint = "https://push.example.test/current";
// 87 unpadded base64url 'A' characters decode to exactly 65 zero bytes.
const publicVapidKey = "A".repeat(87);
const applicationServerKey = new Uint8Array(65).buffer;

function makeSubscription(address = endpoint, expirationTime: number | null = null) {
  return {
    endpoint: address,
    expirationTime,
    options: { applicationServerKey, userVisibleOnly: true },
  } as PushSubscription;
}

describe("Issue 435 passive refresh verification invariants", () => {
  let current: PushSubscription | null;
  let permission: NotificationPermission;
  let active: boolean;
  let transport: GuestWebPushStatusTransport;
  let getSubscription: ReturnType<typeof vi.fn>;
  let getRegistration: ReturnType<typeof vi.fn>;
  let verifySubscription: Mock<(endpoint: string, signal?: AbortSignal) => Promise<boolean>>;

  beforeEach(() => {
    current = makeSubscription();
    permission = "granted";
    active = true;
    getSubscription = vi.fn(async () => current);
    getRegistration = vi.fn(async () => ({
      active: active ? {} : null,
      pushManager: { getSubscription },
    }));
    verifySubscription = vi.fn<
      (endpoint: string, signal?: AbortSignal) => Promise<boolean>
    >(async () => true);
    transport = {
      loadVapidPublicKey: vi.fn(async () => publicVapidKey),
      registerSubscription: vi.fn(async () => undefined),
      verifySubscription,
    };
    vi.stubGlobal("Notification", { get permission() { return permission; } });
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
    vi.stubGlobal("window", {
      isSecureContext: true,
      matchMedia: () => ({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const check = (transport: GuestWebPushStatusTransport) =>
    readGuestWebPushStatus(transport, new AbortController().signal);

  it("confirms an exact ACTIVE endpoint with the currently configured VAPID key", async () => {
    await expect(check(transport)).resolves.toBe("ENABLED_VERIFIED");
    expect(verifySubscription).toHaveBeenCalledExactlyOnceWith(endpoint, expect.any(AbortSignal));
    expect(transport.registerSubscription).not.toHaveBeenCalled();
  });

  it("requires exact server ACTIVE proof for the current endpoint", async () => {
    verifySubscription.mockResolvedValue(false);
    await expect(check(transport)).resolves.toBe("SERVER_BINDING_MISSING");
    expect(verifySubscription).toHaveBeenCalledWith(endpoint, expect.any(AbortSignal));
    expect(transport.registerSubscription).not.toHaveBeenCalled();
  });

  it("never reports enabled if a subscription changes during an active server check", async () => {
    verifySubscription.mockImplementation(async () => {
      current = makeSubscription("https://push.example.test/replaced");
      return true;
    });
    await expect(check(transport)).rejects.toThrow("changed during verification");
    expect(getSubscription).toHaveBeenCalledTimes(2);
    expect(transport.registerSubscription).not.toHaveBeenCalled();
  });

  it("rechecks OS permission after active server verification", async () => {
    verifySubscription.mockImplementation(async () => {
      permission = "denied";
      return true;
    });
    await expect(check(transport)).resolves.toBe("DENIED");
    expect(transport.registerSubscription).not.toHaveBeenCalled();
  });

  it("does not treat expired or missing service worker subscriptions as enabled", async () => {
    current = makeSubscription(endpoint, Date.now() - 1);
    await expect(check(transport)).resolves.toBe("SUBSCRIPTION_MISSING");
    active = false;
    current = makeSubscription();
    await expect(check(transport)).resolves.toBe("SUBSCRIPTION_MISSING");
    expect(verifySubscription).not.toHaveBeenCalled();
    expect(transport.registerSubscription).not.toHaveBeenCalled();
  });

  it("keeps denied permission passive without reading or registering a subscription", async () => {
    permission = "denied";
    await expect(check(transport)).resolves.toBe("DENIED");
    expect(getRegistration).not.toHaveBeenCalled();
    expect(verifySubscription).not.toHaveBeenCalled();
    expect(transport.registerSubscription).not.toHaveBeenCalled();
  });

  it("never attempts background push on a non-installed iPhone browser tab", async () => {
    vi.stubGlobal("navigator", {
      standalone: false,
      serviceWorker: { getRegistration },
    });
    await expect(check(transport)).resolves.toBe("IOS_HOME_SCREEN_REQUIRED");
    expect(transport.loadVapidPublicKey).not.toHaveBeenCalled();
    expect(getRegistration).not.toHaveBeenCalled();
    expect(transport.registerSubscription).not.toHaveBeenCalled();
  });

  it("blocks Web Push when the browser context is insecure", async () => {
    vi.stubGlobal("window", {
      isSecureContext: false,
      matchMedia: () => ({ matches: false }),
    });
    await expect(check(transport)).resolves.toBe("UNSUPPORTED");
    expect(transport.loadVapidPublicKey).not.toHaveBeenCalled();
    expect(getRegistration).not.toHaveBeenCalled();
  });

  it("honors disabled platform configuration without verifying a local endpoint", async () => {
    vi.mocked(transport.loadVapidPublicKey).mockRejectedValueOnce(
      new GuestWebPushDisabledError(),
    );
    await expect(check(transport)).resolves.toBe("DISABLED");
    expect(getRegistration).not.toHaveBeenCalled();
    expect(verifySubscription).not.toHaveBeenCalled();
    expect(transport.registerSubscription).not.toHaveBeenCalled();
  });
});
