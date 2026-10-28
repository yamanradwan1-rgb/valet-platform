/** Process-lifetime, fixed-cardinality diagnostics. Never accept request labels. */
const bounds = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 15000];
export type PhotoTiming =
  | "queue"
  | "processing"
  | "startup"
  | "metadata"
  | "normalization"
  | "termination"
  | "put"
  | "get";
export type PhotoFailure =
  | "queueFull"
  | "queueExpired"
  | "cancelled"
  | "workerCrash"
  | "processingTimeout"
  | "invalidImage"
  | "storageFailure"
  | "storageTimeout"
  | "storageUnknown"
  | "tooLarge";

export class ConditionPhotoProcessingMetrics {
  active = 0;
  waiting = 0;
  queuedBytes = 0;
  ingressActive = 0;
  ingressRejected = 0;
  decoded = 0;
  verifiedUploadExecutions = 0;
  readonly failures: Record<PhotoFailure, number> = {
    queueFull: 0,
    queueExpired: 0,
    cancelled: 0,
    workerCrash: 0,
    processingTimeout: 0,
    invalidImage: 0,
    storageFailure: 0,
    storageTimeout: 0,
    storageUnknown: 0,
    tooLarge: 0,
  };
  private readonly timingTotalsMs: Partial<Record<PhotoTiming, number>> = {};
  private readonly timings: Record<PhotoTiming, number[]> = {
    queue: bounds.map(() => 0).concat(0),
    processing: bounds.map(() => 0).concat(0),
    startup: bounds.map(() => 0).concat(0),
    metadata: bounds.map(() => 0).concat(0),
    normalization: bounds.map(() => 0).concat(0),
    termination: bounds.map(() => 0).concat(0),
    put: bounds.map(() => 0).concat(0),
    get: bounds.map(() => 0).concat(0),
  };

  observe(name: PhotoTiming, milliseconds: number) {
    this.timingTotalsMs[name] = (this.timingTotalsMs[name] ?? 0) + milliseconds;
    const index = bounds.findIndex((bound) => milliseconds <= bound);
    this.timings[name][index < 0 ? bounds.length : index]! += 1;
  }

  snapshot() {
    return {
      active: this.active,
      waiting: this.waiting,
      queuedBytes: this.queuedBytes,
      ingressActive: this.ingressActive,
      ingressRejected: this.ingressRejected,
      decoded: this.decoded,
      verifiedUploadExecutions: this.verifiedUploadExecutions,
      failures: { ...this.failures },
      // Non-cumulative buckets; percentiles are upper-bound approximations.
      timingBoundsMs: [...bounds],
      timingTotalsMs: { ...this.timingTotalsMs },
      timingPercentileUpperBoundsMs: Object.fromEntries(
        Object.entries(this.timings).map(([key, counts]) => {
          const count = counts.reduce((total, value) => total + value, 0);
          const quantile = (fraction: number) => {
            if (count === 0) return null;
            let cumulative = 0;
            const index = counts.findIndex((value) => {
              cumulative += value;
              return cumulative >= Math.ceil(count * fraction);
            });
            return bounds[index] ?? null;
          };
          return [
            key,
            { p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99) },
          ];
        }),
      ),
      timings: Object.fromEntries(
        Object.entries(this.timings).map(([key, value]) => [key, [...value]]),
      ),
    };
  }
}

export const conditionPhotoProcessingMetrics =
  new ConditionPhotoProcessingMetrics();
