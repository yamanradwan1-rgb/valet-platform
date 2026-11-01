import type { GuestWebPushLocale } from "./guest-web-push-copy";
import { GuestApiError } from "../../lib/api/api-error";
import { registerServiceWorker } from "../../lib/pwa/register-pwa";
import {
  announceBrowserContextChange,
  readBrowserContextMarker,
} from "../../lib/api/guest-browser-context-marker";
import {
  boundedGuestWebPushStage,
  guestWebPushAbortError,
  guestWebPushStages,
  GuestWebPushStageError,
  GuestWebPushTimeoutError,
} from "./guest-web-push-stage";

export type GuestWebPushCapability =
  "AVAILABLE" | "DENIED" | "IOS_HOME_SCREEN_REQUIRED" | "UNSUPPORTED";

export interface GuestWebPushCapabilitySnapshot {
  readonly displayModeStandalone: boolean | null;
  readonly hasNotification: boolean;
  readonly hasPushManager: boolean;
  readonly hasServiceWorker: boolean;
  readonly iosStandalone: boolean | null;
  readonly isSecureContext: boolean;
  readonly permission: NotificationPermission | "unsupported";
}

export interface GuestWebPushRegistrationPayload {
  readonly endpoint: string;
  readonly auth: string;
  readonly locale: GuestWebPushLocale;
  readonly p256dh: string;
}

export interface GuestWebPushTransport {
  loadVapidPublicKey(signal?: AbortSignal): Promise<string>;
  registerSubscription(
    payload: GuestWebPushRegistrationPayload,
    signal?: AbortSignal,
  ): Promise<void>;
}

interface BrowserPushDependencies {
  readonly capability: () => GuestWebPushCapabilitySnapshot;
  readonly requestPermission: () => Promise<NotificationPermission>;
  readonly serviceWorkerReady: () => Promise<ServiceWorkerRegistration>;
}

function readIosStandalone(): boolean | null {
  if (typeof navigator === "undefined") return null;
  const value = (navigator as Navigator & { readonly standalone?: unknown })
    .standalone;
  return typeof value === "boolean" ? value : null;
}

function readDisplayModeStandalone(): boolean | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return null;
  try {
    return window.matchMedia("(display-mode: standalone)").matches === true;
  } catch {
    return null;
  }
}

export function readGuestWebPushCapability(): GuestWebPushCapabilitySnapshot {
  const hasNotification = typeof Notification !== "undefined";
  return {
    displayModeStandalone: readDisplayModeStandalone(),
    hasNotification,
    hasPushManager: typeof PushManager !== "undefined",
    hasServiceWorker:
      typeof navigator !== "undefined" && "serviceWorker" in navigator,
    iosStandalone: readIosStandalone(),
    isSecureContext:
      typeof window !== "undefined" && window.isSecureContext === true,
    permission: hasNotification ? Notification.permission : "unsupported",
  };
}

export function detectGuestWebPushCapability(
  snapshot: GuestWebPushCapabilitySnapshot,
): GuestWebPushCapability {
  if (snapshot.iosStandalone === false) return "IOS_HOME_SCREEN_REQUIRED";
  if (snapshot.displayModeStandalone === null) return "UNSUPPORTED";
  if (
    snapshot.iosStandalone === true &&
    snapshot.displayModeStandalone !== true
  ) {
    return "UNSUPPORTED";
  }
  if (
    !snapshot.isSecureContext ||
    !snapshot.hasNotification ||
    !snapshot.hasPushManager ||
    !snapshot.hasServiceWorker
  )
    return "UNSUPPORTED";
  return snapshot.permission === "denied" ? "DENIED" : "AVAILABLE";
}

function decodeVapidPublicKey(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function serializeSubscription(
  subscription: PushSubscription,
  locale: GuestWebPushLocale,
): GuestWebPushRegistrationPayload {
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const auth = json.keys?.auth;
  const p256dh = json.keys?.p256dh;
  if (
    typeof endpoint !== "string" ||
    endpoint.length === 0 ||
    typeof auth !== "string" ||
    auth.length === 0 ||
    typeof p256dh !== "string" ||
    p256dh.length === 0
  ) {
    throw new Error("Guest Web Push subscription is incomplete.");
  }
  return { endpoint, auth, locale, p256dh };
}

function browserDependencies(): BrowserPushDependencies {
  return {
    capability: readGuestWebPushCapability,
    requestPermission: () => Notification.requestPermission(),
    serviceWorkerReady: () => {
      // Explicit retry may recover a failed load-time registration. Never wait
      // for this before the synchronous permission request in the user gesture.
      registerServiceWorker();
      return navigator.serviceWorker.ready;
    },
  };
}

function assertGuestPushContext(expected: string | null): void {
  if (expected === readBrowserContextMarker()) return;
  announceBrowserContextChange();
  throw new GuestApiError({
    status: 409,
    code: "GUEST_CONTEXT_CHANGED",
    message: "The guest browser context changed.",
  });
}

export async function enableGuestWebPush(
  transport: GuestWebPushTransport,
  locale: GuestWebPushLocale,
  signal?: AbortSignal,
  dependencies: BrowserPushDependencies = browserDependencies(),
): Promise<"ENABLED" | GuestWebPushCapability> {
  const browserContext = readBrowserContextMarker();
  const boundedStage = guestWebPushStages(signal);
  const stages: typeof boundedStage = (stage, timeout, work) =>
    boundedStage(stage, timeout, work).catch((error: unknown) => {
      if (
        error instanceof GuestApiError ||
        error instanceof GuestWebPushTimeoutError ||
        (error instanceof Error && error.name === "AbortError")
      )
        throw error;
      throw new GuestWebPushStageError(stage, error);
    });
  const assertCurrent = () => {
    if (signal?.aborted) throw guestWebPushAbortError();
    assertGuestPushContext(browserContext);
  };
  assertCurrent();
  const initial = dependencies.capability();
  const initialCapability = detectGuestWebPushCapability(initial);
  if (initialCapability !== "AVAILABLE") return initialCapability;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new GuestApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: "Offline.",
      isNetworkError: true,
    });
  }

  let permission = initial.permission;
  if (permission === "default") {
    permission = await stages("permission", 15_000, () =>
      dependencies.requestPermission(),
    );
  }
  assertCurrent();
  if (permission !== "granted")
    return permission === "denied" ? "DENIED" : "AVAILABLE";

  const registration = await stages("service worker", 8_000, () =>
    dependencies.serviceWorkerReady(),
  );
  assertCurrent();
  let subscription = await stages("existing subscription", 5_000, () =>
    registration.pushManager.getSubscription(),
  );
  assertCurrent();
  let created = false;
  if (subscription === null) {
    const publicKey = await stages("public key", 8_000, (stageSignal) =>
      transport.loadVapidPublicKey(stageSignal),
    );
    assertCurrent();
    let applicationServerKey: ArrayBuffer;
    try {
      applicationServerKey = decodeVapidPublicKey(publicKey);
    } catch (error) {
      throw new GuestWebPushStageError("public key", error);
    }
    // subscribe() is native and not abortable. A late resolution must never
    // continue into server binding or remove a subscription a retry may reuse.
    subscription = await stages("subscribe", 10_000, () =>
      registration.pushManager.subscribe({
        applicationServerKey,
        userVisibleOnly: true,
      }),
    );
    created = true;
    assertCurrent();
  }

  let registrationStarted = false;
  try {
    const payload = serializeSubscription(subscription, locale);
    assertCurrent();
    await stages("server registration", 10_000, (stageSignal) => {
      registrationStarted = true;
      return transport.registerSubscription(payload, stageSignal);
    });
    assertCurrent();
    return "ENABLED";
  } catch (error) {
    // Once POST begins, a rejected/aborted/lost response is an UNKNOWN commit.
    // Keep the browser subscription so a new authorized gesture can reconcile.
    // Also preserve subscriptions reused by this or a concurrent operation.
    if (
      created &&
      !registrationStarted &&
      !signal?.aborted &&
      browserContext === readBrowserContextMarker()
    ) {
      await boundedGuestWebPushStage(
        "local subscription cleanup",
        () => subscription.unsubscribe(),
        1_500,
      ).catch(() => false);
    }
    throw error;
  }
}
