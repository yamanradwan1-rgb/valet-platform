import type { PendingNativePushReconcile } from "./native-push-types";

/**
 * A network call from a retired Staff generation cannot block a subsequent
 * authenticated generation's desired-state reconciliation.
 *
 * This schedules only local attempts; it never cancels or authorizes a
 * previously dispatched server operation. The API remains authoritative.
 */
export class NativePushReconcileScheduler {
  private active:
    | { readonly generation: number; readonly promise: Promise<void> }
    | undefined;
  private pending: PendingNativePushReconcile | undefined;

  constructor(
    private readonly isCurrent: (generation: number) => boolean,
    private readonly perform: (next: PendingNativePushReconcile) => Promise<void>,
  ) {}

  enqueue(next: PendingNativePushReconcile): Promise<void> {
    if (!this.isCurrent(next.generation)) return Promise.resolve();
    this.pending = next;
    if (this.active?.generation === next.generation)
      return this.active.promise;
    const promise = this.drain(next.generation).finally(() => {
      if (this.active?.promise === promise) this.active = undefined;
    });
    this.active = { generation: next.generation, promise };
    return promise;
  }

  retire(): void {
    // An old in-flight HTTP request can still reach the server. Its completion
    // is fenced by the caller's generation checks, not presumed cancelled.
    this.pending = undefined;
    this.active = undefined;
  }

  private async drain(generation: number): Promise<void> {
    while (
      this.pending !== undefined &&
      this.pending.generation === generation
    ) {
      const pending = this.pending;
      this.pending = undefined;
      if (!this.isCurrent(generation)) return;
      await this.perform(pending);
    }
  }
}
