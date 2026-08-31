import type {
  WebPushLocale,
  WebPushSubscriptionRequest,
} from "@valet/contracts";

import {
  resolveEmployeePushCapability,
  type EmployeePushCapabilitySnapshot,
  type EmployeePushCapabilityState,
} from "./employee-push-capability";
import type { EmployeePushPublicConfig } from "./employee-push-config";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import {
  base64UrlToUint8Array,
  toEmployeePushSubscriptionRequest,
} from "./employee-push-subscription";

function isWebPushSubscriptionNotAvailable(error: unknown): boolean {
  return (
    error instanceof EmployeeApiError &&
    error.status === 404 &&
    (error.code === "WEB_PUSH_SUBSCRIPTION_NOT_AVAILABLE" ||
      error.code === "NOT_FOUND")
  );
}

export interface EmployeePushApi {
  create(input: WebPushSubscriptionRequest): Promise<{ readonly id: string }>;
  disable(id: string): Promise<unknown>;
  replace(
    id: string,
    input: WebPushSubscriptionRequest,
  ): Promise<{ readonly id: string }>;
}

export interface EmployeePushRuntime {
  capability(): EmployeePushCapabilitySnapshot;
  getSubscription(): Promise<PushSubscription | null>;
  requestPermission(): Promise<NotificationPermission>;
  subscribe(options: PushSubscriptionOptionsInit): Promise<PushSubscription>;
}

export interface EmployeePushStorage {
  clear(): void;
  read(): string | null;
  write(id: string): void;
}

interface EmployeePushManagerOptions {
  readonly api: EmployeePushApi;
  readonly config: EmployeePushPublicConfig;
  readonly runtime: EmployeePushRuntime;
  readonly storage: EmployeePushStorage;
}

export class EmployeePushManager {
  private readonly api: EmployeePushApi;
  private readonly config: EmployeePushPublicConfig;
  private readonly runtime: EmployeePushRuntime;
  private readonly storage: EmployeePushStorage;
  private operationTail: Promise<void> = Promise.resolve();

  constructor(options: EmployeePushManagerOptions) {
    this.api = options.api;
    this.config = options.config;
    this.runtime = options.runtime;
    this.storage = options.storage;
  }

  public guidance(): string {
    return "Push notifications are temporarily unavailable. Continue using the live task queue.";
  }

  public async reconcile(
    locale: WebPushLocale,
  ): Promise<EmployeePushCapabilityState> {
    return this.enqueue(() => this.reconcileNow(locale));
  }

  public async enable(
    locale: WebPushLocale,
  ): Promise<EmployeePushCapabilityState> {
    return this.enqueue(() => this.enableNow(locale));
  }

  public async cleanupBeforeLogout(): Promise<void> {
    return this.enqueue(() => this.cleanupBeforeLogoutNow());
  }

  public async cleanupAfterAuthenticationEnd(): Promise<void> {
    return this.enqueue(() => this.cleanupAfterAuthenticationEndNow());
  }

  private async reconcileNow(
    locale: WebPushLocale,
  ): Promise<EmployeePushCapabilityState> {
    if (!this.config.enabled || !this.config.vapidPublicKey)
      return "UNAVAILABLE";

    let capability: EmployeePushCapabilitySnapshot;
    try {
      capability = this.runtime.capability();
    } catch {
      return "UNSUPPORTED";
    }
    const preliminary = resolveEmployeePushCapability(capability, false);
    if (preliminary === "DENIED") {
      await this.disableStoredBinding();
      return preliminary;
    }
    if (
      preliminary === "UNSUPPORTED" ||
      preliminary === "IOS_REQUIRES_HOME_SCREEN" ||
      preliminary === "PROMPT_AVAILABLE"
    ) {
      return preliminary;
    }
    return this.reconcileGranted(locale);
  }

  private async enableNow(
    locale: WebPushLocale,
  ): Promise<EmployeePushCapabilityState> {
    if (!this.config.enabled || !this.config.vapidPublicKey)
      return "UNAVAILABLE";
    let preliminary: EmployeePushCapabilityState;
    try {
      preliminary = resolveEmployeePushCapability(
        this.runtime.capability(),
        false,
      );
    } catch {
      return "UNSUPPORTED";
    }
    if (preliminary !== "PROMPT_AVAILABLE") return this.reconcileNow(locale);

    let permission: NotificationPermission;
    try {
      permission = await this.runtime.requestPermission();
    } catch {
      return "RECOVERABLE_ERROR";
    }
    if (permission !== "granted") {
      if (permission === "denied") await this.disableStoredBinding();
      return permission === "denied" ? "DENIED" : "PROMPT_AVAILABLE";
    }
    return this.reconcileGranted(locale);
  }

  private async cleanupBeforeLogoutNow(): Promise<void> {
    if (!this.config.enabled) {
      this.storage.clear();
      return;
    }
    const serverId = this.storage.read();
    if (serverId) {
      try {
        await this.api.disable(serverId);
      } catch {
        // Logout must remain available when the network is unavailable.
      }
    }
    await this.unsubscribeBrowser();
    this.storage.clear();
  }

  private async cleanupAfterAuthenticationEndNow(): Promise<void> {
    if (!this.config.enabled) {
      this.storage.clear();
      return;
    }
    await this.unsubscribeBrowser();
    this.storage.clear();
  }

  private async reconcileGranted(
    locale: WebPushLocale,
  ): Promise<EmployeePushCapabilityState> {
    const publicKey = this.config.enabled ? this.config.vapidPublicKey : null;
    if (!publicKey) return "UNAVAILABLE";
    try {
      let subscription = await this.runtime.getSubscription();
      const serverId = this.storage.read();

      if (subscription && serverId) {
        try {
          const response = await this.api.replace(
            serverId,
            toEmployeePushSubscriptionRequest(subscription, locale),
          );
          this.storage.write(response.id);
          return "SUBSCRIBED";
        } catch (error: unknown) {
          if (!isWebPushSubscriptionNotAvailable(error)) throw error;
          this.storage.clear();
          if (!(await subscription.unsubscribe())) return "RECOVERABLE_ERROR";
          subscription = null;
        }
      }

      if (serverId && !subscription) {
        try {
          await this.api.disable(serverId);
        } catch {
          // The fresh exact-session subscribe remains authoritative server-side.
        }
        this.storage.clear();
      }

      if (subscription && !serverId) {
        const removed = await subscription.unsubscribe();
        if (!removed) return "RECOVERABLE_ERROR";
        subscription = null;
      }

      subscription ??= await this.runtime.subscribe({
        applicationServerKey: base64UrlToUint8Array(publicKey),
        userVisibleOnly: true,
      });
      const response = await this.api.create(
        toEmployeePushSubscriptionRequest(subscription, locale),
      );
      this.storage.write(response.id);
      return "SUBSCRIBED";
    } catch {
      return "RECOVERABLE_ERROR";
    }
  }

  private async disableStoredBinding(): Promise<void> {
    const serverId = this.storage.read();
    if (!serverId) return;
    try {
      await this.api.disable(serverId);
      this.storage.clear();
    } catch {
      // Delivery authority is still revalidated server-side.
    }
  }

  private async unsubscribeBrowser(): Promise<void> {
    try {
      const subscription = await this.runtime.getSubscription();
      await subscription?.unsubscribe();
    } catch {
      // Best-effort cleanup must not block logout.
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
