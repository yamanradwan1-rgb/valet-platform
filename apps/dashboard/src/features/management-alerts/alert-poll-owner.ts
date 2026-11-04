import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { ManagementAlertPreview } from "./alert-model";

export type AlertPollStatus = "unavailable" | "loading" | "ready" | "suspended";
export interface AlertPollState<T = ManagementAlertPreview> {
  readonly status: AlertPollStatus;
  readonly preview: T | null;
}

export interface AlertPollOptions<T = ManagementAlertPreview> {
  readonly load: (signal: AbortSignal) => Promise<T>;
  readonly currentAuthority: () => boolean;
  readonly onState: (state: AlertPollState<T>) => void;
  readonly jitter?: () => number;
}

const minute = 60_000;
const requestDeadlineMs = 10_000;
const backoffMs = [minute, 2 * minute, 4 * minute] as const;

function isDefinitive(reason: unknown): boolean {
  if (!(reason instanceof DashboardApiError)) return false;
  if (
    [
      "auth",
      "mfa",
      "authorization",
      "entitlement",
      "malformed",
      "validation",
    ].includes(reason.kind)
  )
    return true;
  return (
    reason.kind === "unknown" &&
    reason.status !== 0 &&
    reason.status !== 429 &&
    reason.status < 500
  );
}

/** One foreground, monotonic scope owner. An abort alone never authorizes repaint. */
export class AlertPollOwner<T = ManagementAlertPreview> {
  private readonly options: AlertPollOptions<T>;
  private foreground = false;
  private disposed = false;
  private suspended = false;
  private serial = 0;
  private failures = 0;
  private readAfterSettle = false;
  private pending: Promise<void> | undefined;
  private controller: AbortController | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;

  constructor(options: AlertPollOptions<T>) {
    this.options = options;
  }

  setForeground(foreground: boolean): void {
    if (this.disposed || this.foreground === foreground) return;
    this.foreground = foreground;
    this.clearTimer();
    this.invalidate();
    if (!foreground) this.readAfterSettle = false;
    this.publish({
      status: this.suspended ? "suspended" : "unavailable",
      preview: null,
    });
    if (foreground && !this.suspended) this.readWhenAvailable();
  }

  refresh(): Promise<void> {
    if (this.disposed || !this.foreground) return Promise.resolve();
    if (this.pending) return this.pending;
    if (this.suspended) return Promise.resolve();
    this.clearTimer();
    return this.read();
  }

  /** Preference revision changed: retire even a non-cooperative prior response. */
  invalidatePreferences(): void {
    if (this.disposed) return;
    this.clearTimer();
    this.invalidate();
    this.publish({
      status: this.suspended ? "suspended" : "unavailable",
      preview: null,
    });
    if (this.foreground && !this.suspended) this.readWhenAvailable();
  }

  /** Only an explicit user retry may leave definitive-denial suspension. */
  recover(): Promise<void> {
    if (this.disposed || !this.foreground || !this.options.currentAuthority()) {
      return Promise.resolve();
    }
    this.suspended = false;
    this.failures = 0;
    if (this.pending) {
      this.readAfterSettle = true;
      return this.pending;
    }
    return this.refresh();
  }

  dispose(): void {
    this.disposed = true;
    this.foreground = false;
    this.readAfterSettle = false;
    this.clearTimer();
    this.invalidate();
  }

  private readWhenAvailable(): void {
    if (this.pending) {
      this.readAfterSettle = true;
    } else {
      void this.read();
    }
  }

  private read(): Promise<void> {
    if (
      this.disposed ||
      !this.foreground ||
      this.suspended ||
      !this.options.currentAuthority()
    )
      return Promise.resolve();
    if (this.pending) return this.pending;
    const serial = ++this.serial;
    const controller = new AbortController();
    let timedOut = false;
    this.controller = controller;
    this.publish({ status: "loading", preview: null });
    this.deadline = setTimeout(() => {
      if (!this.current(serial)) return;
      timedOut = true;
      this.serial += 1;
      controller.abort();
      this.controller = undefined;
      this.clearDeadline();
      this.publish({ status: "unavailable", preview: null });
      // Keep single-flight ownership until even an abort-ignoring request
      // settles. It may be timed out for UI purposes, but not safe to overlap.
    }, requestDeadlineMs);
    const request = Promise.resolve().then(() => {
      if (!this.current(serial) || controller.signal.aborted) return;
      return this.options.load(controller.signal);
    });
    const pending = request
      .then(
        (preview) => {
          if (!this.current(serial)) return;
          if (preview === undefined) return;
          this.clearDeadline();
          this.controller = undefined;
          this.failures = 0;
          this.publish({ status: "ready", preview });
          this.schedule(minute);
        },
        (reason: unknown) => {
          if (!this.current(serial) || controller.signal.aborted) return;
          this.clearDeadline();
          this.controller = undefined;
          if (isDefinitive(reason)) {
            this.suspended = true;
            this.publish({ status: "suspended", preview: null });
            this.clearTimer();
          } else {
            this.publish({ status: "unavailable", preview: null });
            this.scheduleFailure();
          }
        },
      )
      .finally(() => {
        if (this.pending === pending) {
          this.pending = undefined;
          const restart = this.readAfterSettle;
          this.readAfterSettle = false;
          if (
            !this.foreground ||
            this.disposed ||
            this.suspended ||
            !this.options.currentAuthority()
          )
            return;
          // A timed-out request retains the in-flight slot until settlement,
          // and retries only after the bounded failure backoff.
          if (timedOut) this.scheduleFailure();
          else if (restart) void this.read();
        }
      });
    this.pending = pending;
    return pending;
  }

  private current(serial: number): boolean {
    return (
      !this.disposed &&
      this.foreground &&
      serial === this.serial &&
      this.options.currentAuthority()
    );
  }

  private scheduleFailure(): void {
    const delay = backoffMs[Math.min(this.failures, backoffMs.length - 1)]!;
    this.failures += 1;
    this.schedule(delay);
  }

  private schedule(delay: number): void {
    this.clearTimer();
    if (this.disposed || !this.foreground || this.suspended) return;
    const jitter = Math.max(
      0,
      Math.min(3000, this.options.jitter?.() ?? Math.random() * 3000),
    );
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.read();
    }, delay + jitter);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private clearDeadline(): void {
    if (this.deadline !== undefined) clearTimeout(this.deadline);
    this.deadline = undefined;
  }

  private invalidate(): void {
    this.serial += 1;
    this.controller?.abort();
    this.controller = undefined;
    // Cancellation retires UI authority, not transport ownership. A fetch
    // that ignores AbortSignal still occupies the only slot until it settles.
    this.clearDeadline();
  }

  private publish(state: AlertPollState<T>): void {
    this.options.onState(state);
  }
}
