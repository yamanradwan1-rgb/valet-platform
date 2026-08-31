import type { CustomerPushCapabilitySnapshot } from "./customer-push-capability";
import type { CustomerPushRuntime } from "./customer-push-manager";

function isIosLike(value: Navigator): boolean {
  return (
    /iPad|iPhone|iPod/.test(value.userAgent) ||
    (value.platform === "MacIntel" && value.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export class BrowserCustomerPushRuntime implements CustomerPushRuntime {
  private registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

  capability(): CustomerPushCapabilitySnapshot {
    return {
      isIosLike: isIosLike(navigator),
      isStandalone: isStandalone(),
      notification: "Notification" in window,
      permission:
        "Notification" in window ? Notification.permission : "default",
      pushManager: "PushManager" in window,
      serviceWorker: "serviceWorker" in navigator,
    };
  }

  async getSubscription(): Promise<PushSubscription | null> {
    return (await this.registration()).pushManager.getSubscription();
  }

  requestPermission(): Promise<NotificationPermission> {
    return Notification.requestPermission();
  }

  async subscribe(
    options: PushSubscriptionOptionsInit,
  ): Promise<PushSubscription> {
    return (await this.registration()).pushManager.subscribe(options);
  }

  private registration(): Promise<ServiceWorkerRegistration> {
    this.registrationPromise ??= navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready);
    return this.registrationPromise;
  }
}
