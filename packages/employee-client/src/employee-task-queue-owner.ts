import { EmployeeApiError } from "./api-error";
import { operationalFailure } from "./employee-operational-recovery";
import type {
  EmployeeOperationalFailure,
  EmployeeOperationalScope,
  EmployeeOperationalTransport,
} from "./employee-operational-types";
import type { StaffTaskQueueItem } from "@valet/contracts";

export interface EmployeeQueueSnapshotEvent {
  readonly failure: EmployeeOperationalFailure | null;
  readonly hardStopped: boolean;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly scope: EmployeeOperationalScope;
  readonly successfulSnapshotCount: number;
  readonly tasks?: readonly StaffTaskQueueItem[] | undefined;
}

interface EmployeeTaskQueueOwnerOptions {
  readonly intervalMs: number;
  readonly onSnapshot: (event: EmployeeQueueSnapshotEvent) => void;
  readonly transport: EmployeeOperationalTransport;
}

function scopeKey(generation: number, scope: EmployeeOperationalScope): string {
  return [
    generation,
    scope.organizationId,
    scope.membershipId,
    scope.locationId,
    scope.shiftId,
  ].join(":");
}

function isHardStop(error: unknown): boolean {
  return (
    error instanceof EmployeeApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

export class EmployeeTaskQueueOwner {
  private active:
    | {
        readonly key: string;
        readonly promise: Promise<void>;
      }
    | undefined;
  private abortController: AbortController | undefined;
  private foreground = false;
  private hardStopped = false;
  private retryNotBefore = 0;
  private suspended = false;
  private scope:
    | {
        readonly generation: number;
        readonly key: string;
        readonly value: EmployeeOperationalScope;
      }
    | undefined;
  private successfulSnapshotCount = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: EmployeeTaskQueueOwnerOptions) {}

  setForeground(foreground: boolean): void {
    this.foreground = foreground;
    if (!foreground) {
      this.stopTimer();
      this.abortActive();
      return;
    }
    this.startTimer();
  }

  setScope(
    generation: number,
    scope: EmployeeOperationalScope,
  ): { readonly changed: boolean; readonly promise: Promise<void> } {
    const key = scopeKey(generation, scope);
    const changed = this.scope?.key !== key;
    if (changed) {
      this.abortActive();
      this.retryNotBefore = 0;
      this.successfulSnapshotCount = 0;
    }
    this.scope = { generation, key, value: scope };
    this.hardStopped = false;
    this.suspended = false;
    this.startTimer();
    return {
      changed,
      promise: this.foreground ? this.refresh(changed) : Promise.resolve(),
    };
  }

  clear(): void {
    this.stopTimer();
    this.abortActive();
    this.scope = undefined;
    this.hardStopped = false;
    this.retryNotBefore = 0;
    this.successfulSnapshotCount = 0;
    this.suspended = false;
  }

  suspend(): void {
    this.stopTimer();
    this.abortActive();
    this.suspended = true;
  }

  refresh(initial = false): Promise<void> {
    const target = this.scope;
    if (
      !this.foreground ||
      target === undefined ||
      this.hardStopped ||
      this.suspended
    ) {
      return Promise.resolve();
    }
    if (Date.now() < this.retryNotBefore) return Promise.resolve();
    if (this.active?.key === target.key) return this.active.promise;
    if (this.active !== undefined) this.abortActive();

    const controller = new AbortController();
    this.abortController = controller;
    const promise = this.load(target, controller, initial);
    this.active = { key: target.key, promise };
    return promise;
  }

  dispose(): void {
    this.foreground = false;
    this.clear();
  }

  refreshAfterTerminalMutation(): Promise<void> {
    this.abortActive();
    return this.refresh();
  }

  private async load(
    target: NonNullable<EmployeeTaskQueueOwner["scope"]>,
    controller: AbortController,
    initial: boolean,
  ): Promise<void> {
    this.options.onSnapshot({
      failure: null,
      hardStopped: false,
      loading: initial,
      refreshing: !initial,
      scope: target.value,
      successfulSnapshotCount: this.successfulSnapshotCount,
    });
    try {
      const response = await this.options.transport.loadTaskQueue(
        target.value.locationId,
        controller.signal,
      );
      if (!this.isCurrent(target.key, controller)) return;
      this.successfulSnapshotCount += 1;
      this.retryNotBefore = 0;
      this.options.onSnapshot({
        failure: null,
        hardStopped: false,
        loading: false,
        refreshing: false,
        scope: target.value,
        successfulSnapshotCount: this.successfulSnapshotCount,
        tasks: response.tasks,
      });
    } catch (error) {
      if (!this.isCurrent(target.key, controller)) return;
      this.hardStopped = isHardStop(error);
      const failure = operationalFailure(error);
      if (failure.status === 429 && failure.retryAfter !== undefined) {
        this.retryNotBefore = Date.now() + failure.retryAfter * 1000;
      }
      if (this.hardStopped) this.stopTimer();
      this.options.onSnapshot({
        failure,
        hardStopped: this.hardStopped,
        loading: false,
        refreshing: false,
        scope: target.value,
        successfulSnapshotCount: this.successfulSnapshotCount,
      });
    } finally {
      if (this.abortController === controller) {
        this.abortController = undefined;
        this.active = undefined;
      }
    }
  }

  private isCurrent(key: string, controller: AbortController): boolean {
    return !controller.signal.aborted && this.scope?.key === key;
  }

  private startTimer(): void {
    if (
      !this.foreground ||
      this.hardStopped ||
      this.suspended ||
      this.scope === undefined ||
      this.timer !== undefined
    ) {
      return;
    }
    this.timer = setInterval(
      () => void this.refresh(),
      this.options.intervalMs,
    );
  }

  private stopTimer(): void {
    if (this.timer === undefined) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private abortActive(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.active = undefined;
  }
}
