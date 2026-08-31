import type { EmployeePushCapabilitySnapshot } from "./employee-push-capability";
import type { EmployeePushRuntime } from "./employee-push-manager";

function isIosLike(navigatorValue: Navigator): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigatorValue.userAgent) ||
    (navigatorValue.platform === "MacIntel" &&
      navigatorValue.maxTouchPoints > 1)
  );
}

function isStandalone(windowValue: Window): boolean {
  return (
    (typeof windowValue.matchMedia === "function" &&
      windowValue.matchMedia("(display-mode: standalone)").matches) ||
    (windowValue.navigator as Navigator & { standalone?: boolean })
      .standalone === true
  );
}

export class BrowserEmployeePushRuntime implements EmployeePushRuntime {
  private registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

  public capability(): EmployeePushCapabilitySnapshot {
    const serviceWorker = "serviceWorker" in navigator;
    return {
      isIosLike: isIosLike(navigator),
      isStandalone: isStandalone(window),
      notification: "Notification" in window,
      permission:
        "Notification" in window ? Notification.permission : "default",
      pushManager: "PushManager" in window,
      serviceWorker,
    };
  }

  public async getSubscription(): Promise<PushSubscription | null> {
    const registration = await this.registration();
    return registration.pushManager.getSubscription();
  }

  public requestPermission(): Promise<NotificationPermission> {
    return Notification.requestPermission();
  }

  public async subscribe(
    options: PushSubscriptionOptionsInit,
  ): Promise<PushSubscription> {
    const registration = await this.registration();
    return registration.pushManager.subscribe(options);
  }

  private registration(): Promise<ServiceWorkerRegistration> {
    this.registrationPromise ??= navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready);
    return this.registrationPromise;
  }
}
