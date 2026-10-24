import { vi } from "vitest";

import type {
  GuestWebPushCapabilitySnapshot,
  GuestWebPushTransport,
} from "./guest-web-push-client";

export const available = (): GuestWebPushCapabilitySnapshot => ({
  displayModeStandalone: false,
  hasNotification: true,
  hasPushManager: true,
  hasServiceWorker: true,
  iosStandalone: null,
  isSecureContext: true,
  permission: "granted",
});

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function subscription() {
  return {
    endpoint: "https://push.example.test/subscription",
    toJSON: () => ({
      endpoint: "https://push.example.test/subscription",
      keys: { auth: "auth-key", p256dh: "p256dh-key" },
    }),
    unsubscribe: vi.fn(async () => true),
  } as unknown as PushSubscription;
}

export function transport(
  overrides: Partial<GuestWebPushTransport> = {},
): GuestWebPushTransport {
  return {
    loadVapidPublicKey: vi.fn(async () => "BEl6N3N1hXlJ2HtQ8LrT7t75cQ"),
    registerSubscription: vi.fn(async () => undefined),
    ...overrides,
  };
}

export function browser(pushManager: Partial<PushManager>) {
  return {
    capability: available,
    requestPermission: vi.fn(async () => "granted" as NotificationPermission),
    serviceWorkerReady: async () =>
      ({ pushManager }) as ServiceWorkerRegistration,
  };
}
