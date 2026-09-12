export type EmployeeConnectivityStatus = "offline" | "online" | "unknown";

export interface EmployeeConnectivityAdapter {
  read(): Promise<EmployeeConnectivityStatus>;
  subscribe(listener: (status: EmployeeConnectivityStatus) => void): () => void;
}

/** Process-local, provider-neutral connectivity hint. It is never API authority. */
export class EmployeeConnectivityOwner {
  private disposed = false;
  private eventObserved = false;
  private started = false;
  private status: EmployeeConnectivityStatus = "unknown";
  private unsubscribe: (() => void) | undefined;
  private readonly subscribers = new Set<
    (status: EmployeeConnectivityStatus) => void
  >();

  constructor(private readonly adapter: EmployeeConnectivityAdapter) {}

  current(): EmployeeConnectivityStatus {
    return this.status;
  }

  subscribe(
    listener: (status: EmployeeConnectivityStatus) => void,
  ): () => void {
    if (this.disposed) {
      listener(this.status);
      return () => undefined;
    }
    this.subscribers.add(listener);
    listener(this.status);
    return () => this.subscribers.delete(listener);
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    try {
      const unsubscribe = this.adapter.subscribe((status) => {
        if (this.disposed) return;
        this.eventObserved = true;
        this.publish(status);
      });
      if (this.disposed) unsubscribe();
      else this.unsubscribe = unsubscribe;
    } catch {
      this.publish("unknown");
      return;
    }
    void this.adapter
      .read()
      .then((status) => {
        if (!this.disposed && !this.eventObserved) this.publish(status);
      })
      .catch(() => {
        if (!this.disposed && !this.eventObserved) this.publish("unknown");
      });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.subscribers.clear();
  }

  private publish(status: EmployeeConnectivityStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.subscribers) listener(status);
  }
}
