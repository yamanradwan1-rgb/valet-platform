import { DashboardApiError } from "../../../lib/api/dashboard-api-error";

export const liveMapPollDelayMs = 10_000;
export const liveMapRequestTimeoutMs = 10_000;
const transientBackoffMs = [20_000, 40_000, 60_000] as const;

export interface LiveMapRefreshState<T> {
  readonly data: T | null;
  readonly error: Error | null;
  readonly loading: boolean;
}

export interface LiveMapRefreshOwnerOptions<T> {
  readonly load: (signal: AbortSignal) => Promise<T>;
  readonly onState: (state: LiveMapRefreshState<T>) => void;
}

function errorValue(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("Request failed.");
}

function definitiveAuthorityFailure(error: Error): boolean {
  return (
    error instanceof DashboardApiError &&
    ["auth", "mfa", "authorization", "entitlement"].includes(error.kind)
  );
}

export class LiveMapRefreshOwner<T> {
  private active = false;
  private automatic = true;
  private controller: AbortController | undefined;
  private data: T | null = null;
  private disposed = false;
  private failureCount = 0;
  private generation = 0;
  private inFlight: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private visible = true;

  constructor(private readonly options: LiveMapRefreshOwnerOptions<T>) {}

  setActive(active: boolean): void {
    if (this.disposed || this.active === active) return;
    this.active = active;
    if (!active) {
      this.retireRequest();
      this.clearTimer();
      return;
    }
    this.automatic = true;
    if (this.visible) void this.request(false);
  }

  setVisible(visible: boolean): void {
    if (this.disposed || this.visible === visible) return;
    this.visible = visible;
    if (!visible) {
      this.retireRequest();
      this.clearTimer();
      return;
    }
    if (this.active && this.automatic) void this.request(false);
  }

  refresh(): Promise<void> {
    if (this.disposed || !this.active || !this.visible) return Promise.resolve();
    this.clearTimer();
    return this.request(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.retireRequest();
    this.clearTimer();
  }

  private request(manual: boolean): Promise<void> {
    if (this.inFlight !== undefined) return this.inFlight;
    if (
      this.disposed ||
      !this.active ||
      !this.visible ||
      (!manual && !this.automatic)
    ) return Promise.resolve();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    this.publish({ data: this.data, error: null, loading: true });
    let timedOut = false;
    this.timeout = setTimeout(() => {
      if (!this.isCurrent(generation)) return;
      timedOut = true;
      this.generation += 1;
      controller.abort();
      this.controller = undefined;
      this.inFlight = undefined;
      const error = new Error("Live Operations request timed out.");
      this.data = null;
      this.publish({ data: null, error, loading: false });
      this.scheduleTransientFailure();
    }, liveMapRequestTimeoutMs);
    const inFlight = this.options.load(controller.signal).then(
      (data) => {
        if (!this.isCurrent(generation)) return;
        this.clearTimeoutTimer();
        this.controller = undefined;
        this.failureCount = 0;
        this.automatic = true;
        this.data = data;
        this.publish({ data, error: null, loading: false });
        this.schedule(liveMapPollDelayMs);
      },
      (reason: unknown) => {
        if (timedOut || !this.isCurrent(generation) || controller.signal.aborted) return;
        this.clearTimeoutTimer();
        this.controller = undefined;
        const error = errorValue(reason);
        this.data = null;
        this.publish({ data: null, error, loading: false });
        if (definitiveAuthorityFailure(error)) {
          this.automatic = false;
          this.clearTimer();
        } else {
          this.scheduleTransientFailure();
        }
      },
    ).finally(() => {
      if (this.inFlight === inFlight) this.inFlight = undefined;
    });
    this.inFlight = inFlight;
    return inFlight;
  }

  private scheduleTransientFailure(): void {
    const index = Math.min(this.failureCount, transientBackoffMs.length - 1);
    this.failureCount += 1;
    this.schedule(transientBackoffMs[index]!);
  }

  private schedule(delay: number): void {
    this.clearTimer();
    if (this.disposed || !this.active || !this.visible || !this.automatic) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.request(false);
    }, delay);
  }

  private retireRequest(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = undefined;
    this.inFlight = undefined;
    this.clearTimeoutTimer();
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private clearTimeoutTimer(): void {
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    this.timeout = undefined;
  }

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private publish(state: LiveMapRefreshState<T>): void {
    this.options.onState(state);
  }
}
