import {
  EmployeeGpsSampleBuffer,
  type EmployeeGpsIngestionTransport,
} from "@valet/employee-client";

import {
  NativeTaskLocationAdapter,
  type NativeTaskLocationAccess,
  type NativeTaskLocationFix,
  type NativeTaskLocationPort,
  type NativeTaskLocationWatcher,
} from "./native-task-location-adapter";
import {
  isRetryableGpsUnknown,
  nativeTaskGpsPhysicalFix,
  nativeTaskTrackingAccessStatus,
  sameNativeTaskTrackingStatus,
} from "./native-task-gps-policy";
import { NativeTaskGpsRetryBudget } from "./native-task-gps-retry";
import {
  nativeTaskGpsAdmissionMs,
  nativeTaskGpsUploadMs,
  type NativeTaskTrackingBinding,
  type NativeTaskTrackingStatus,
} from "./native-task-tracking-types";

interface NativeTaskGpsPublisherOptions {
  readonly createId: () => string;
  readonly isAuthorized: (binding: NativeTaskTrackingBinding) => boolean;
  readonly location?: NativeTaskLocationPort | undefined;
  readonly now?: (() => number) | undefined;
  readonly random?: (() => number) | undefined;
  readonly onDefinitiveFailure: (binding: NativeTaskTrackingBinding) => void;
  readonly onUnknown: (binding: NativeTaskTrackingBinding) => void;
  readonly transport: EmployeeGpsIngestionTransport;
}

export class NativeTaskGpsPublisher {
  private abort: AbortController | undefined;
  private binding: NativeTaskTrackingBinding | undefined;
  private readonly buffer: EmployeeGpsSampleBuffer;
  private disposed = false;
  private generation = 0;
  private generationStartedAt = 0;
  private lastAdmissionAt = Number.NEGATIVE_INFINITY;
  private readonly location: NativeTaskLocationPort;
  private readonly now: () => number;
  private readonly retry: NativeTaskGpsRetryBudget;
  private status: NativeTaskTrackingStatus = { kind: "idle" };
  private readonly subscribers = new Set<
    (status: NativeTaskTrackingStatus) => void
  >();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watcher: NativeTaskLocationWatcher | undefined;

  constructor(private readonly options: NativeTaskGpsPublisherOptions) {
    this.location = options.location ?? new NativeTaskLocationAdapter();
    this.now = options.now ?? Date.now;
    this.buffer = new EmployeeGpsSampleBuffer({ createId: options.createId });
    this.retry = new NativeTaskGpsRetryBudget(options.random);
  }

  current(): NativeTaskTrackingStatus {
    return this.status;
  }

  currentBindingKey(): string | undefined {
    return this.binding?.key;
  }

  subscribe(listener: (status: NativeTaskTrackingStatus) => void): () => void {
    this.subscribers.add(listener);
    listener(this.status);
    return () => this.subscribers.delete(listener);
  }

  start(binding: NativeTaskTrackingBinding, requestPermission = false): void {
    if (this.disposed) return;
    const sameBinding = this.binding?.key === binding.key;
    if (
      sameBinding &&
      (this.watcher !== undefined || this.status.kind === "checking")
    ) {
      return;
    }
    this.stopGeneration(!sameBinding);
    this.binding = binding;
    void this.startWatcher(binding, requestPermission || !sameBinding);
  }

  pause(status: NativeTaskTrackingStatus): void {
    if (this.disposed) return;
    this.stopGeneration(false);
    this.publish(status);
  }

  retire(status: NativeTaskTrackingStatus): void {
    this.stopGeneration(true);
    this.binding = undefined;
    this.publish(status);
  }

  openSettings(): Promise<void> {
    return this.location.openSettings();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.retire({ kind: "idle" });
    this.subscribers.clear();
  }

  private async startWatcher(
    binding: NativeTaskTrackingBinding,
    requestPermission: boolean,
  ): Promise<void> {
    const generation = ++this.generation;
    this.generationStartedAt = this.now();
    this.lastAdmissionAt = Number.NEGATIVE_INFINITY;
    this.publish({ kind: "checking" });
    try {
      const access = await this.location.ensureAccess(requestPermission);
      if (!this.isCurrent(generation, binding)) return;
      if (access.kind !== "granted") {
        this.blockAccess(binding, access);
        return;
      }
      const watcher = await this.location.watch(
        (fix) => this.admitFix(generation, binding, fix),
        () => this.failLocation(generation, binding),
      );
      if (!this.isCurrent(generation, binding)) {
        watcher.remove();
        return;
      }
      this.watcher = watcher;
      this.publish({ kind: "active", taskType: binding.taskType });
      this.scheduleUpload(
        generation,
        binding,
        this.retry.pendingDelay() ?? nativeTaskGpsUploadMs,
      );
    } catch {
      if (this.isCurrent(generation, binding)) {
        this.failLocation(generation, binding);
      }
    }
  }

  private admitFix(
    generation: number,
    binding: NativeTaskTrackingBinding,
    fix: NativeTaskLocationFix,
  ): void {
    if (!this.isCurrent(generation, binding)) return;
    const now = this.now();
    if (now - this.lastAdmissionAt < nativeTaskGpsAdmissionMs) return;
    const physical = nativeTaskGpsPhysicalFix(
      fix,
      binding,
      this.generationStartedAt,
      now,
    );
    if (physical === null) return;
    const sample = this.buffer.admit(physical, now);
    if (sample !== null) this.lastAdmissionAt = now;
  }

  private scheduleUpload(
    generation: number,
    binding: NativeTaskTrackingBinding,
    delay = nativeTaskGpsUploadMs,
  ): void {
    if (!this.isCurrent(generation, binding)) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.upload(generation, binding);
    }, delay);
  }

  private async upload(
    generation: number,
    binding: NativeTaskTrackingBinding,
  ): Promise<void> {
    if (!this.isCurrent(generation, binding)) return;
    const access = await this.location
      .inspectAccess()
      .catch(
        () =>
          ({ canAskAgain: true, kind: "denied" }) as const,
      );
    if (!this.isCurrent(generation, binding)) return;
    if (access.kind !== "granted") {
      this.blockAccess(binding, access);
      return;
    }
    if (!this.options.isAuthorized(binding)) {
      this.retire({ kind: "idle" });
      return;
    }
    const batch = this.buffer.beginBatch(this.now());
    if (batch === null) {
      this.scheduleUpload(generation, binding);
      return;
    }
    const abort = new AbortController();
    this.abort = abort;
    try {
      const response = await this.options.transport.upload(
        binding.sessionId,
        batch,
        abort.signal,
      );
      if (!this.isCurrent(generation, binding)) return;
      this.abort = undefined;
      if (!this.buffer.acceptResponse(response)) {
        this.handleUnknown(binding);
        return;
      }
      this.retry.reset();
      this.scheduleUpload(generation, binding);
    } catch (error) {
      if (!this.isCurrent(generation, binding)) return;
      this.abort = undefined;
      this.buffer.markUnknown();
      if (isRetryableGpsUnknown(error)) {
        this.handleUnknown(binding);
      } else {
        this.retire({ kind: "idle" });
        this.options.onDefinitiveFailure(binding);
      }
    }
  }

  private handleUnknown(binding: NativeTaskTrackingBinding): void {
    this.buffer.markUnknown();
    if (this.retry.nextDelay() === null) {
      this.retire({ kind: "unavailable" });
    } else {
      this.pause({ kind: "unavailable" });
    }
    this.options.onUnknown(binding);
  }

  private blockAccess(
    binding: NativeTaskTrackingBinding,
    access: Exclude<NativeTaskLocationAccess, { kind: "granted" }>,
  ): void {
    const status = nativeTaskTrackingAccessStatus(access);
    this.stopGeneration(true);
    this.binding = binding;
    this.publish(status);
  }

  private failLocation(
    generation: number,
    binding: NativeTaskTrackingBinding,
  ): void {
    if (!this.isCurrent(generation, binding)) return;
    this.stopGeneration(true);
    this.binding = binding;
    this.publish({ kind: "unavailable" });
  }

  private stopGeneration(clearBuffer: boolean): void {
    this.generation += 1;
    this.watcher?.remove();
    this.watcher = undefined;
    this.abort?.abort();
    this.abort = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (clearBuffer) {
      this.buffer.clear();
      this.retry.reset();
    }
    else this.buffer.markUnknown();
  }

  private isCurrent(
    generation: number,
    binding: NativeTaskTrackingBinding,
  ): boolean {
    return (
      !this.disposed &&
      generation === this.generation &&
      this.binding?.key === binding.key
    );
  }

  private publish(status: NativeTaskTrackingStatus): void {
    if (sameNativeTaskTrackingStatus(this.status, status)) return;
    this.status = status;
    this.subscribers.forEach((subscriber) => subscriber(status));
  }
}
