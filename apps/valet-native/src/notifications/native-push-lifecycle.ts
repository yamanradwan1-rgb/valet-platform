import type {
  EmployeeLocale,
  NativeAuthSnapshot,
} from "@valet/employee-client";

import {
  nativePushDesiredStateMatches,
  nativePushRequestIsCurrent,
  nativePushResponseMatches,
  type ConfirmedNativePushState,
} from "./native-push-desired-state";
import { NativePushForegroundAttentionOwner } from "./native-push-foreground-attention";
import { pushRegistrationFailureState } from "./native-push-registration-failure";
import {
  emptyNativePushSnapshot,
  unauthenticatedNativePushAuth,
  type NativePushInstallationId,
  type NativePushLifecycleReason,
  type NativePushPermissionState,
  type NativePushPlatformAdapter,
  type NativePushRegistrationTransport,
  type NativePushSnapshot,
  type PendingNativePushReconcile,
} from "./native-push-types";

export class NativePushLifecycleOwner {
  private active: Promise<void> | undefined;
  private auth: NativeAuthSnapshot = unauthenticatedNativePushAuth(0);
  private confirmed: ConfirmedNativePushState | undefined;
  private currentToken: string | undefined;
  private readonly attention = new NativePushForegroundAttentionOwner();
  private listeners = new Set<(snapshot: NativePushSnapshot) => void>();
  private locale: EmployeeLocale = "en";
  private pending: PendingNativePushReconcile | undefined;
  private removers: Array<() => void> = [];
  private snapshot = emptyNativePushSnapshot();
  private started = false;

  constructor(
    private readonly platform: NativePushPlatformAdapter,
    private readonly installation: NativePushInstallationId,
    private readonly transport: NativePushRegistrationTransport,
  ) {}

  current(): NativePushSnapshot {
    return this.snapshot;
  }
  subscribe(listener: (snapshot: NativePushSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.removers = [
      this.platform.startForegroundPresentation(),
      this.platform.subscribeToken((token) => {
        void this.receiveToken(token, this.auth.authGeneration);
      }),
      this.platform.subscribeForegroundReceipt((data) => {
        this.receiveForeground(data, this.auth.authGeneration);
      }),
    ];
  }

  dispose(): void {
    if (!this.started) return;
    this.started = false;
    for (const remove of this.removers.splice(0)) remove();
    this.pending = undefined;
    this.clearIdentity();
    this.listeners.clear();
  }

  setAuth(auth: NativeAuthSnapshot): Promise<void> {
    const generationChanged = auth.authGeneration !== this.auth.authGeneration;
    const becameAuthenticated =
      auth.phase === "authenticated" && this.auth.phase !== "authenticated";
    if (generationChanged || auth.phase !== "authenticated") {
      this.clearIdentity();
    }
    this.auth = auth;
    if (
      becameAuthenticated ||
      (generationChanged && auth.phase === "authenticated")
    ) {
      return this.reconcile("authentication");
    }
    return Promise.resolve();
  }

  setLocale(locale: EmployeeLocale): Promise<void> {
    if (locale === this.locale) return Promise.resolve();
    this.locale = locale;
    return this.auth.phase === "authenticated"
      ? this.reconcile("locale")
      : Promise.resolve();
  }

  setForeground(foreground: boolean): Promise<void> {
    const resumed = this.attention.setForeground(foreground);
    if (resumed && this.auth.phase === "authenticated") {
      return this.reconcile("foreground");
    }
    return Promise.resolve();
  }

  networkRecovered(): Promise<void> {
    if (this.auth.phase === "authenticated") {
      return this.reconcile("network-recovery");
    }
    return Promise.resolve();
  }

  async requestPermission(): Promise<void> {
    if (this.auth.phase !== "authenticated") return;
    const generation = this.auth.authGeneration;
    let permission: NativePushPermissionState;
    try {
      permission = await this.platform.requestPermission();
    } catch {
      permission = "unavailable";
    }
    if (!this.isCurrent(generation)) return;
    this.publish({ permission });
    if (permission === "granted") await this.reconcile("permission");
  }

  async purgeIdentity(): Promise<void> {
    this.clearIdentity();
    try {
      await this.platform.deleteCurrentToken();
    } catch {
      // Local provider cleanup is best effort and cannot fail auth purge.
    }
  }

  dismissAttention(intentId: string): void {
    const attentionIntentIds = this.attention.dismiss(intentId);
    if (attentionIntentIds !== undefined) this.publish({ attentionIntentIds });
  }

  receiveForeground(data: unknown, expectedGeneration: number): void {
    const attentionIntentIds = this.attention.receive(
      data,
      this.isCurrent(expectedGeneration),
    );
    if (attentionIntentIds !== undefined) this.publish({ attentionIntentIds });
  }

  reconcile(reason: NativePushLifecycleReason): Promise<void> {
    return this.queue({ generation: this.auth.authGeneration, reason });
  }

  async receiveToken(token: string, generation: number): Promise<void> {
    if (!this.isCurrent(generation)) return;
    if (this.currentToken === token) return;
    this.currentToken = token;
    await this.queue({
      generation,
      providedToken: token,
      reason: "token-change",
    });
  }

  private queue(next: PendingNativePushReconcile): Promise<void> {
    if (!this.isCurrent(next.generation)) {
      return Promise.resolve();
    }
    this.pending = next;
    if (this.active !== undefined) return this.active;
    const promise = this.drain().finally(() => {
      if (this.active === promise) this.active = undefined;
    });
    this.active = promise;
    return promise;
  }

  private async drain(): Promise<void> {
    while (this.pending !== undefined) {
      const pending = this.pending;
      this.pending = undefined;
      if (!this.isCurrent(pending.generation)) continue;
      await this.perform(pending);
    }
  }

  private async perform(pending: PendingNativePushReconcile): Promise<void> {
    const generation = pending.generation;
    this.publish({ registration: "reconciling" });
    let permission: NativePushPermissionState;
    try {
      permission = await this.platform.readPermission();
    } catch {
      permission = "unavailable";
    }
    if (!this.isCurrent(generation)) return;
    this.publish({ permission });
    if (permission !== "granted") {
      this.currentToken = undefined;
      this.confirmed = undefined;
      this.publish({
        registration: permission === "unavailable" ? "unavailable" : "idle",
      });
      return;
    }

    try {
      const channelAvailable = await this.platform.ensureRetrievalChannel();
      if (this.isCurrent(generation)) this.publish({ channelAvailable });
    } catch {
      if (this.isCurrent(generation)) this.publish({ channelAvailable: false });
    }
    if (!this.isCurrent(generation)) return;
    const metadata = this.platform.currentMetadata();
    if (metadata === undefined) {
      this.publish({ registration: "unavailable" });
      return;
    }
    let token: string;
    try {
      token = pending.providedToken ?? (await this.platform.getCurrentToken());
    } catch {
      if (this.isCurrent(generation))
        this.publish({ registration: "token-unavailable" });
      return;
    }
    if (!this.isCurrent(generation)) return;
    this.currentToken = token;
    if (
      pending.reason === "token-change" &&
      nativePushDesiredStateMatches(
        this.confirmed,
        token,
        this.locale,
        metadata,
      )
    ) {
      this.publish({ registration: "confirmed" });
      return;
    }
    try {
      const installationId = await this.installation.getOrCreate();
      if (!this.isCurrent(generation)) return;
      const request = this.platform.buildRegistrationRequest({
        installationId,
        locale: this.locale,
        metadata,
        token,
      });
      if (request === undefined) {
        this.publish({ registration: "unavailable" });
        return;
      }
      const requestIsCurrent = () =>
        nativePushRequestIsCurrent(
          request,
          this.currentToken,
          this.locale,
          this.platform.currentMetadata(),
        );
      if (!requestIsCurrent()) return;
      const response = await this.transport.reconcile(request);
      if (!this.isCurrent(generation) || !requestIsCurrent()) return;
      if (!nativePushResponseMatches(response, request)) {
        this.publish({ registration: "registration-error" });
        return;
      }
      this.confirmed = { ...metadata, locale: this.locale, token };
      this.publish({ registration: "confirmed" });
    } catch (error) {
      if (this.isCurrent(generation)) {
        this.publish({ registration: pushRegistrationFailureState(error) });
      }
    }
  }

  private isCurrent(generation: number): boolean {
    return (
      this.auth.phase === "authenticated" &&
      this.auth.authGeneration === generation
    );
  }

  private clearIdentity(): void {
    this.auth = unauthenticatedNativePushAuth(this.auth.authGeneration);
    this.pending = undefined;
    this.currentToken = undefined;
    this.confirmed = undefined;
    this.attention.clear();
    this.publish({ attentionIntentIds: [], registration: "idle" });
  }

  private publish(change: Partial<NativePushSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener(this.snapshot);
  }
}
