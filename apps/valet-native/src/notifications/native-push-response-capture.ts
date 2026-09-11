import { normalizeNativePushResponse } from "./native-push-response-parser";
import type {
  NativePushResponseConsumer,
  NativePushResponsePlatform,
  NativePushRouteIntent,
} from "./native-push-response-types";

const defaultRecentLimit = 64;
const defaultPendingLimit = 16;

/**
 * Process-local response capture. Limits are memory safety guards, not delivery
 * or product capacity policy; process death intentionally clears all state.
 */
export class NativePushResponseCapture {
  private consumers = new Set<NativePushResponseConsumer>();
  private pending: NativePushRouteIntent[] = [];
  private recentIds = new Set<string>();
  private recentOrder: string[] = [];
  private lifecycle = 0;
  private removeListener: (() => void) | undefined;
  private started = false;
  private startupRead: Promise<void> | undefined;

  constructor(
    private readonly platform: NativePushResponsePlatform,
    private readonly recentLimit = defaultRecentLimit,
    private readonly pendingLimit = defaultPendingLimit,
  ) {}

  start(): Promise<void> {
    if (this.started) return this.startupRead ?? Promise.resolve();
    this.started = true;
    const lifecycle = ++this.lifecycle;
    this.removeListener = this.platform.subscribeResponse((response) => {
      if (!this.started || lifecycle !== this.lifecycle) return;
      this.capture(response);
    });
    this.startupRead = this.readInitial(lifecycle);
    return this.startupRead;
  }

  subscribe(consumer: NativePushResponseConsumer): () => void {
    this.consumers.add(consumer);
    const captured = this.pending.splice(0);
    for (const intent of captured) consumer(intent);
    return () => this.consumers.delete(consumer);
  }

  dispose(): void {
    this.removeListener?.();
    this.removeListener = undefined;
    this.started = false;
    this.lifecycle += 1;
    this.startupRead = undefined;
    this.consumers.clear();
    this.pending = [];
    this.recentIds.clear();
    this.recentOrder = [];
  }

  private async readInitial(lifecycle: number): Promise<void> {
    let response: unknown | null;
    try {
      response = await this.platform.getLastResponse();
    } catch {
      return;
    }
    if (!this.started || lifecycle !== this.lifecycle) return;
    if (response === null) return;
    this.capture(response);
    try {
      await this.platform.clearLastResponse();
    } catch {
      // Captured application memory wins; native cleanup is best effort.
    }
  }

  private capture(response: unknown): void {
    const intent = normalizeNativePushResponse(
      response,
      this.platform.defaultActionIdentifier,
    );
    if (intent === null || this.recentIds.has(intent.intentId)) return;
    this.remember(intent.intentId);
    if (this.consumers.size > 0) {
      for (const consumer of this.consumers) consumer(intent);
      return;
    }
    this.pending.push(intent);
    if (this.pending.length > this.pendingLimit) this.pending.shift();
  }

  private remember(intentId: string): void {
    this.recentIds.add(intentId);
    this.recentOrder.push(intentId);
    while (this.recentOrder.length > this.recentLimit) {
      const oldest = this.recentOrder.shift();
      if (oldest !== undefined) this.recentIds.delete(oldest);
    }
  }
}
