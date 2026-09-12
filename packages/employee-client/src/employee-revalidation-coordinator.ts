export type EmployeeRevalidationReason =
  "foreground" | "network-recovery" | "push-attention";

export interface EmployeeRevalidationBatch {
  readonly reasons: ReadonlySet<EmployeeRevalidationReason>;
}

/** Coalesces safe current-authority reads without timers or mutation replay. */
export class EmployeeRevalidationCoordinator {
  private active: Promise<void> | undefined;
  private disposed = false;
  private foreground = false;
  private pending = new Set<EmployeeRevalidationReason>();
  private scheduled = false;

  constructor(
    private readonly run: (batch: EmployeeRevalidationBatch) => Promise<void>,
  ) {}

  setForeground(foreground: boolean): void {
    if (this.disposed || this.foreground === foreground) return;
    this.foreground = foreground;
    if (foreground) this.request("foreground");
  }

  request(reason: EmployeeRevalidationReason): void {
    if (this.disposed) return;
    this.pending.add(reason);
    if (!this.foreground || this.scheduled || this.active !== undefined) return;
    this.scheduled = true;
    queueMicrotask(() => this.startPending());
  }

  whenIdle(): Promise<void> {
    return this.active ?? Promise.resolve();
  }

  dispose(): void {
    this.disposed = true;
    this.pending.clear();
  }

  private startPending(): void {
    this.scheduled = false;
    if (
      this.disposed ||
      !this.foreground ||
      this.active !== undefined ||
      this.pending.size === 0
    )
      return;
    const reasons = this.pending;
    this.pending = new Set();
    const operation = this.run({ reasons })
      .catch(() => undefined)
      .finally(() => {
        if (this.active === operation) this.active = undefined;
        if (this.pending.size > 0 && this.foreground && !this.disposed) {
          this.request([...this.pending][0]!);
        }
      });
    this.active = operation;
  }
}
