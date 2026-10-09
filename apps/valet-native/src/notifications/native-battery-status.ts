export type BatteryOptimizationStatus =
  | "checking"
  | "configured"
  | "restricted"
  | "unknown"
  | "unsupported";

export interface NativeBatteryOptimizationAdapter {
  readStatus(): Promise<Exclude<BatteryOptimizationStatus, "checking">>;
  openSettings(): Promise<void>;
}

const READ_TIMEOUT_MS = 2_500;

/** Single presentation owner; never changes notification delivery or OS settings. */
export class NativeBatteryStatusOwner {
  private generation = 0;
  private active = false;
  private started = false;
  private disposed = false;
  private status: BatteryOptimizationStatus = "checking";
  private readonly listeners = new Set<(status: BatteryOptimizationStatus) => void>();
  private pending: { generation: number; promise: Promise<void> } | undefined;

  constructor(private readonly adapter: NativeBatteryOptimizationAdapter) {}

  current = (): BatteryOptimizationStatus => this.status;

  subscribe = (listener: (status: BatteryOptimizationStatus) => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  start(foreground: boolean): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.setForeground(foreground);
  }

  setForeground(foreground: boolean): void {
    if (!this.started || this.disposed || foreground === this.active) return;
    this.active = foreground;
    if (!foreground) {
      this.generation++;
      this.publish("checking"); // stale warning must disappear before resume
      return;
    }
    void this.refresh();
  }

  refresh(): Promise<void> {
    if (!this.active || this.disposed) return Promise.resolve();
    const previous = this.pending;
    if (previous?.generation === this.generation) return previous.promise;
    const generation = ++this.generation;
    this.publish("checking");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedRead = Promise.race([
      Promise.resolve().then(() => this.adapter.readStatus()),
      new Promise<"unknown">((resolve) => {
        timeout = setTimeout(() => resolve("unknown"), READ_TIMEOUT_MS);
      }),
    ]);
    const promise = timedRead
      .catch(() => "unknown" as const)
      .then((status) => {
        if (this.active && !this.disposed && generation === this.generation) {
          this.publish(status);
        }
      })
      .finally(() => {
        if (timeout !== undefined) clearTimeout(timeout);
        if (this.pending?.generation === generation) this.pending = undefined;
      });
    this.pending = { generation, promise };
    return promise;
  }

  openSettings(): Promise<void> {
    if (this.disposed || this.status !== "restricted") return Promise.resolve();
    return Promise.resolve().then(() => this.adapter.openSettings()).catch(() => undefined);
  }

  dispose(): void {
    this.disposed = true;
    this.active = false;
    this.generation++;
    this.listeners.clear();
    this.pending = undefined;
  }

  private publish(status: BatteryOptimizationStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }
}
