import { afterEach, describe, expect, it, vi } from "vitest";

import { enableGuestWebPush } from "./guest-web-push-client";
import {
  available,
  browser,
  deferred,
  subscription,
  transport,
} from "./guest-web-push-boundary-test-fixtures";
import { GuestWebPushTimeoutError } from "./guest-web-push-stage";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Guest Web Push bounded browser stages", () => {
  it("invokes the OS permission prompt synchronously during the explicit gesture", async () => {
    const permission = deferred<NotificationPermission>();
    const requestPermission = vi.fn(() => permission.promise);
    const ready = vi.fn();
    const pending = enableGuestWebPush(transport(), "en", undefined, {
      capability: () => ({ ...available(), permission: "default" }),
      requestPermission,
      serviceWorkerReady: ready,
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
    permission.resolve("default");
    await expect(pending).resolves.toBe("AVAILABLE");
    expect(ready).not.toHaveBeenCalled();
  });

  it("bounds an OS prompt that never settles and ignores late grant", async () => {
    vi.useFakeTimers();
    const permission = deferred<NotificationPermission>();
    const ready = vi.fn();
    const pending = enableGuestWebPush(transport(), "en", undefined, {
      capability: () => ({ ...available(), permission: "default" }),
      requestPermission: () => permission.promise,
      serviceWorkerReady: ready,
    });
    const rejection = expect(pending).rejects.toBeInstanceOf(
      GuestWebPushTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    permission.resolve("granted");
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
  });

  it("aborts a pending service worker ready promise, fencing its late resolution", async () => {
    const controller = new AbortController();
    const ready = deferred<ServiceWorkerRegistration>();
    const getSubscription = vi.fn();
    const pending = enableGuestWebPush(transport(), "en", controller.signal, {
      ...browser({ getSubscription }),
      serviceWorkerReady: () => ready.promise,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await Promise.resolve();
    controller.abort();
    await rejection;
    ready.resolve({
      pushManager: { getSubscription },
    } as unknown as ServiceWorkerRegistration);
    await Promise.resolve();
    expect(getSubscription).not.toHaveBeenCalled();
  });

  it("bounds a service worker ready promise that never becomes ready", async () => {
    vi.useFakeTimers();
    const pending = enableGuestWebPush(transport(), "en", undefined, {
      ...browser({}),
      serviceWorkerReady: () =>
        new Promise<ServiceWorkerRegistration>(() => {}),
    });
    const rejection = expect(pending).rejects.toBeInstanceOf(
      GuestWebPushTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;
  });

  it("bounds a stuck getSubscription without attempting a new subscription", async () => {
    vi.useFakeTimers();
    const subscribe = vi.fn();
    const pending = enableGuestWebPush(
      transport(),
      "en",
      undefined,
      browser({
        getSubscription: () => new Promise<PushSubscription | null>(() => {}),
        subscribe,
      }),
    );
    const rejection = expect(pending).rejects.toBeInstanceOf(
      GuestWebPushTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await rejection;
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("times out a VAPID fetch and aborts its network signal", async () => {
    vi.useFakeTimers();
    let networkSignal: AbortSignal | undefined;
    const loadVapidPublicKey = vi.fn((signal?: AbortSignal) => {
      networkSignal = signal;
      return new Promise<string>(() => {});
    });
    const subscribe = vi.fn();
    const pending = enableGuestWebPush(
      transport({ loadVapidPublicKey }),
      "en",
      undefined,
      browser({ getSubscription: async () => null, subscribe }),
    );
    const rejection = expect(pending).rejects.toBeInstanceOf(
      GuestWebPushTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(8_000);
    await rejection;
    expect(networkSignal?.aborted).toBe(true);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("times out noncancelable native subscribe and fences its eventual result", async () => {
    vi.useFakeTimers();
    const late = deferred<PushSubscription>();
    const registerSubscription = vi.fn();
    const newSubscription = subscription();
    const pending = enableGuestWebPush(
      transport({ registerSubscription }),
      "en",
      undefined,
      browser({
        getSubscription: async () => null,
        subscribe: () => late.promise,
      }),
    );
    const rejection = expect(pending).rejects.toBeInstanceOf(
      GuestWebPushTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    late.resolve(newSubscription);
    await Promise.resolve();
    expect(registerSubscription).not.toHaveBeenCalled();
    expect(newSubscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("retains an unknown server commit and lets the next gesture reuse the subscription", async () => {
    const current = subscription();
    let subscribed: PushSubscription | null = null;
    const subscribe = vi.fn(async () => {
      subscribed = current;
      return current;
    });
    const registerSubscription = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost after commit"))
      .mockResolvedValueOnce(undefined);
    const dependencies = browser({
      getSubscription: async () => subscribed,
      subscribe,
    });
    const clientTransport = transport({ registerSubscription });
    await expect(
      enableGuestWebPush(clientTransport, "en", undefined, dependencies),
    ).rejects.toMatchObject({ stage: "server registration" });
    expect(current.unsubscribe).not.toHaveBeenCalled();
    await expect(
      enableGuestWebPush(clientTransport, "en", undefined, dependencies),
    ).resolves.toBe("ENABLED");
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(registerSubscription).toHaveBeenCalledTimes(2);
    expect(current.unsubscribe).not.toHaveBeenCalled();
  });

  it("bounds a lost registration response without unsubscribing a potentially committed endpoint", async () => {
    vi.useFakeTimers();
    const current = subscription();
    let requestSignal: AbortSignal | undefined;
    const registerSubscription = vi.fn((_payload, signal?: AbortSignal) => {
      requestSignal = signal;
      return new Promise<void>(() => {});
    });
    const pending = enableGuestWebPush(
      transport({ registerSubscription }),
      "en",
      undefined,
      browser({
        getSubscription: async () => null,
        subscribe: async () => current,
      }),
    );
    const rejection = expect(pending).rejects.toBeInstanceOf(
      GuestWebPushTimeoutError,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    expect(registerSubscription).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(current.unsubscribe).not.toHaveBeenCalled();
  });

  it("bounds local cleanup before a server request when a created subscription is malformed", async () => {
    vi.useFakeTimers();
    const unsubscribe = vi.fn(() => new Promise<boolean>(() => {}));
    const incomplete = {
      toJSON: () => ({ endpoint: "https://push.example.test/incomplete" }),
      unsubscribe,
    } as unknown as PushSubscription;
    const registerSubscription = vi.fn();
    const pending = enableGuestWebPush(
      transport({ registerSubscription }),
      "en",
      undefined,
      browser({
        getSubscription: async () => null,
        subscribe: async () => incomplete,
      }),
    );
    const rejection = expect(pending).rejects.toThrow("incomplete");
    await vi.advanceTimersByTimeAsync(1_500);
    await rejection;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it("never unsubscribes a reused browser subscription on local serialization failure", async () => {
    const unsubscribe = vi.fn();
    const existing = {
      toJSON: () => ({ endpoint: "https://push.example.test/incomplete" }),
      unsubscribe,
    } as unknown as PushSubscription;
    await expect(
      enableGuestWebPush(
        transport(),
        "en",
        undefined,
        browser({ getSubscription: async () => existing }),
      ),
    ).rejects.toThrow("incomplete");
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it("blocks a changed guest context before any server registration", async () => {
    const first = "vgc1.11111111111111111111111111111111";
    const second = "vgc1.22222222222222222222222222222222";
    const fakeDocument = { cookie: `__Host-vaylet_guest_context=${first}` };
    vi.stubGlobal("document", fakeDocument);
    const registerSubscription = vi.fn();
    await expect(
      enableGuestWebPush(transport({ registerSubscription }), "en", undefined, {
        ...browser({ getSubscription: async () => subscription() }),
        serviceWorkerReady: async () => {
          fakeDocument.cookie = `__Host-vaylet_guest_context=${second}`;
          return {
            pushManager: { getSubscription: vi.fn() },
          } as unknown as ServiceWorkerRegistration;
        },
      }),
    ).rejects.toMatchObject({ code: "GUEST_CONTEXT_CHANGED" });
    expect(registerSubscription).not.toHaveBeenCalled();
  });
});
