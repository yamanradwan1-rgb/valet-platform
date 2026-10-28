import { ConditionPhotoDecodeError } from "./condition-photo-decode-error";
import {
  conditionPhotoProcessingMetrics,
  type ConditionPhotoProcessingMetrics,
  type PhotoFailure,
} from "./condition-photo-processing-metrics";

interface Job {
  readonly byteSize: number;
  readonly enqueuedAt: number;
  readonly run: (signal?: AbortSignal) => Promise<unknown>;
  readonly signal: AbortSignal | undefined;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
  abort?: () => void;
}

/** One FIFO for uploads and retained-byte verification; no queue bypass. */
export class ConditionPhotoDecodeQueue {
  private active = 0;
  private readonly waiting: Job[] = [];
  private queuedBytes = 0;

  constructor(
    private readonly metrics: ConditionPhotoProcessingMetrics = conditionPhotoProcessingMetrics,
    private readonly waitMs = 5000,
  ) {}

  async execute<T>(
    byteSize: number,
    run: (signal?: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (signal?.aborted) throw this.failure("cancelled");
    if (
      this.active >= 2 &&
      (this.waiting.length >= 2 ||
        this.queuedBytes + byteSize > 16 * 1024 * 1024)
    )
      throw this.failure("queueFull");
    return await new Promise<T>((resolve, reject) => {
      const job: Job = {
        byteSize,
        run,
        signal,
        enqueuedAt: performance.now(),
        resolve: (value) => resolve(value as T),
        reject,
      };
      if (this.active < 2 && this.waiting.length === 0) {
        void this.start(job);
        return;
      }
      this.waiting.push(job);
      this.queuedBytes += byteSize;
      const remove = (reason: PhotoFailure) => {
        const index = this.waiting.indexOf(job);
        if (index < 0) return;
        this.waiting.splice(index, 1);
        this.queuedBytes -= byteSize;
        this.cleanup(job);
        this.metrics.observe("queue", performance.now() - job.enqueuedAt);
        this.publish();
        reject(this.failure(reason));
      };
      job.timer = setTimeout(() => remove("queueExpired"), this.waitMs);
      job.abort = () => remove("cancelled");
      signal?.addEventListener("abort", job.abort, { once: true });
      this.publish();
    });
  }

  private failure(reason: PhotoFailure) {
    this.metrics.failures[reason]++;
    return new ConditionPhotoDecodeError("CONDITION_PHOTO_STORAGE_UNAVAILABLE");
  }

  private cleanup(job: Job) {
    clearTimeout(job.timer);
    if (job.abort) job.signal?.removeEventListener("abort", job.abort);
  }

  private publish() {
    this.metrics.active = this.active;
    this.metrics.waiting = this.waiting.length;
    this.metrics.queuedBytes = this.queuedBytes;
  }

  private async start(job: Job) {
    this.cleanup(job);
    this.active++;
    this.publish();
    this.metrics.observe("queue", performance.now() - job.enqueuedAt);
    const started = performance.now();
    try {
      if (job.signal?.aborted) throw this.failure("cancelled");
      if (performance.now() - job.enqueuedAt >= this.waitMs)
        throw this.failure("queueExpired");
      job.resolve(await job.run(job.signal));
    } catch (error) {
      job.reject(
        error instanceof Error ? error : new Error("JPEG processing failed"),
      );
    } finally {
      this.metrics.observe("processing", performance.now() - started);
      this.active--;
      const next = this.waiting.shift();
      if (next) this.queuedBytes -= next.byteSize;
      this.publish();
      if (next) void this.start(next);
    }
  }
}

export const conditionPhotoDecodeQueue = new ConditionPhotoDecodeQueue();
