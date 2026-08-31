import type {
  WebPushLocale,
  WebPushSubscriptionRequest,
} from "@valet/contracts";

import {
  resolveCustomerPushCapability,
  type CustomerPushCapabilitySnapshot,
  type CustomerPushCapabilityState,
} from "./customer-push-capability";
import type { CustomerPushPublicConfig } from "./customer-push-config";
import {
  base64UrlToUint8Array,
  toCustomerPushSubscriptionRequest,
} from "./customer-push-subscription";

export interface CustomerPushApi {
  create(input: WebPushSubscriptionRequest): Promise<{ readonly id: string }>;
  disable(id: string): Promise<unknown>;
  replace(
    id: string,
    input: WebPushSubscriptionRequest,
  ): Promise<{ readonly id: string }>;
}

export interface CustomerPushRuntime {
  capability(): CustomerPushCapabilitySnapshot;
  getSubscription(): Promise<PushSubscription | null>;
  requestPermission(): Promise<NotificationPermission>;
  subscribe(options: PushSubscriptionOptionsInit): Promise<PushSubscription>;
}

export interface CustomerPushStorage {
  clear(): void;
  read(): string | null;
  write(id: string): void;
}

export class CustomerPushManager {
  private operationTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly options: {
      readonly api: CustomerPushApi;
      readonly config: CustomerPushPublicConfig;
      readonly runtime: CustomerPushRuntime;
      readonly storage: CustomerPushStorage;
    },
  ) {}

  reconcile(locale: WebPushLocale): Promise<CustomerPushCapabilityState> {
    return this.enqueue(() => this.reconcileNow(locale));
  }

  enable(locale: WebPushLocale): Promise<CustomerPushCapabilityState> {
    return this.enqueue(() => this.enableNow(locale));
  }

  cleanupCurrentContext(): Promise<void> {
    return this.enqueue(() => this.cleanupNow());
  }

  private configured(): boolean {
    return this.options.config.enabled;
  }

  private async reconcileNow(
    locale: WebPushLocale,
  ): Promise<CustomerPushCapabilityState> {
    let capability: CustomerPushCapabilitySnapshot;
    try {
      capability = this.options.runtime.capability();
    } catch {
      return "UNSUPPORTED";
    }
    const preliminary = resolveCustomerPushCapability(
      capability,
      this.configured(),
      false,
    );
    if (preliminary === "DENIED") {
      await this.disableKnownBinding();
      return preliminary;
    }
    if (
      preliminary === "UNAVAILABLE" ||
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
  ): Promise<CustomerPushCapabilityState> {
    let preliminary: CustomerPushCapabilityState;
    try {
      preliminary = resolveCustomerPushCapability(
        this.options.runtime.capability(),
        this.configured(),
        false,
      );
    } catch {
      return "UNSUPPORTED";
    }
    if (preliminary !== "PROMPT_AVAILABLE") return this.reconcileNow(locale);
    try {
      const permission = await this.options.runtime.requestPermission();
      if (permission === "denied") {
        await this.disableKnownBinding();
        return "DENIED";
      }
      if (permission !== "granted") return "PROMPT_AVAILABLE";
      return this.reconcileGranted(locale);
    } catch {
      return "RECOVERABLE_ERROR";
    }
  }

  private async reconcileGranted(
    locale: WebPushLocale,
  ): Promise<CustomerPushCapabilityState> {
    const key = this.options.config.enabled
      ? this.options.config.vapidPublicKey
      : null;
    if (!key) return "UNAVAILABLE";
    try {
      let browser = await this.options.runtime.getSubscription();
      const serverId = this.options.storage.read();
      if (browser && serverId) {
        const response = await this.options.api.replace(
          serverId,
          toCustomerPushSubscriptionRequest(browser, locale),
        );
        this.options.storage.write(response.id);
        return "SUBSCRIBED";
      }
      if (serverId && !browser) {
        await this.disableKnownBinding();
      }
      if (browser && !serverId) {
        if (!(await browser.unsubscribe())) return "RECOVERABLE_ERROR";
        browser = null;
      }
      browser ??= await this.options.runtime.subscribe({
        applicationServerKey: base64UrlToUint8Array(key),
        userVisibleOnly: true,
      });
      const response = await this.options.api.create(
        toCustomerPushSubscriptionRequest(browser, locale),
      );
      this.options.storage.write(response.id);
      return "SUBSCRIBED";
    } catch {
      return "RECOVERABLE_ERROR";
    }
  }

  private async disableKnownBinding(): Promise<void> {
    const id = this.options.storage.read();
    if (!id) return;
    try {
      await this.options.api.disable(id);
      this.options.storage.clear();
    } catch {
      // Send-time authority remains canonical; keep the hint for a later retry.
    }
  }

  private async cleanupNow(): Promise<void> {
    await this.disableKnownBinding();
    try {
      await (await this.options.runtime.getSubscription())?.unsubscribe();
    } catch {
      // Context teardown remains non-blocking.
    }
    this.options.storage.clear();
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
