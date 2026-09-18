import type { Pool } from "pg";

import type { RequestSample, SafetySnapshot } from "./capacity-types";
import {
  createCapacityProcessSampler,
  type ProcessMetricSample,
  type ProcessMetricSampler,
} from "./capacity-process-sampler";

export { requireCapacityApiPid } from "./capacity-process-sampler";

export const SAFETY_LIMITS = {
  apiCpuPercent: 95,
  apiCpuSamples: 5,
  apiRssBytes: 768 * 1024 * 1024,
  consecutiveErrors: 10,
  databaseActiveConnections: 80,
  databaseLockWaiters: 10,
  errorRate: 0.05,
  errorRateMinimumSamples: 50,
  maxDurationMs: 180_000,
  maxRequests: 5_000,
  requestTimeoutMs: 3_000,
} as const;

export class CapacitySafetyMonitor {
  private consecutiveErrors = 0;
  private highCpuSamples = 0;
  private lastProcessSample: ProcessMetricSample | undefined;
  private requestCount = 0;
  readonly snapshots: SafetySnapshot[] = [];
  private readonly startedAt = Date.now();

  constructor(
    private readonly pool: Pool,
    private readonly apiPid: number,
    private readonly processSampler: ProcessMetricSampler = createCapacityProcessSampler(),
  ) {}

  record(sample: RequestSample): void {
    this.requestCount += 1;
    this.consecutiveErrors =
      sample.status >= 200 && sample.status < 300
        ? 0
        : this.consecutiveErrors + 1;
  }

  assertRequestLimits(samples: readonly RequestSample[]): void {
    if (this.requestCount > SAFETY_LIMITS.maxRequests) {
      throw new Error("SAFETY_ABORT: request cap exceeded");
    }
    if (Date.now() - this.startedAt > SAFETY_LIMITS.maxDurationMs) {
      throw new Error("SAFETY_ABORT: duration cap exceeded");
    }
    if (this.consecutiveErrors >= SAFETY_LIMITS.consecutiveErrors) {
      throw new Error("SAFETY_ABORT: consecutive error limit reached");
    }
    if (samples.length >= SAFETY_LIMITS.errorRateMinimumSamples) {
      const errors = samples.filter(
        (sample) => sample.status < 200 || sample.status >= 300,
      ).length;
      if (errors / samples.length > SAFETY_LIMITS.errorRate) {
        throw new Error("SAFETY_ABORT: error-rate limit exceeded");
      }
    }
  }

  async snapshot(): Promise<SafetySnapshot> {
    const database = await this.pool.query<{
      active: number;
      waiting: number;
    }>(`SELECT count(*)::integer AS active,
              count(*) FILTER (WHERE wait_event_type = 'Lock')::integer AS waiting
       FROM pg_stat_activity WHERE datname = current_database()`);
    const row = database.rows[0];
    if (row === undefined) throw new Error("Database health is unavailable.");
    const processSample = await this.processSampler.sample(this.apiPid);
    let apiCpuPercent: number | null = null;
    if (this.lastProcessSample !== undefined) {
      if (
        processSample.processIdentity !== this.lastProcessSample.processIdentity
      ) {
        throw new Error(
          "API process identity changed during capacity sampling.",
        );
      }
      const processDelta =
        processSample.processCpuUnits - this.lastProcessSample.processCpuUnits;
      const capacityDelta =
        processSample.oneCpuCapacityUnits -
        this.lastProcessSample.oneCpuCapacityUnits;
      if (processDelta < 0 || capacityDelta <= 0) {
        throw new Error("API CPU sample is invalid.");
      }
      apiCpuPercent = Number(((processDelta / capacityDelta) * 100).toFixed(2));
    }
    this.lastProcessSample = processSample;
    const snapshot = {
      apiCpuPercent,
      apiRssBytes: processSample.rssBytes,
      databaseActiveConnections: row.active,
      databaseLockWaiters: row.waiting,
      observedAt: new Date().toISOString(),
    };
    this.assertSystemLimits(snapshot);
    this.snapshots.push(snapshot);
    return snapshot;
  }

  private assertSystemLimits(snapshot: SafetySnapshot): void {
    if (
      snapshot.databaseActiveConnections >=
      SAFETY_LIMITS.databaseActiveConnections
    )
      throw new Error("SAFETY_ABORT: database connection limit reached");
    if (snapshot.databaseLockWaiters >= SAFETY_LIMITS.databaseLockWaiters)
      throw new Error("SAFETY_ABORT: database lock-wait limit reached");
    if ((snapshot.apiRssBytes ?? 0) >= SAFETY_LIMITS.apiRssBytes)
      throw new Error("SAFETY_ABORT: API RSS limit reached");
    this.highCpuSamples =
      (snapshot.apiCpuPercent ?? 0) >= SAFETY_LIMITS.apiCpuPercent
        ? this.highCpuSamples + 1
        : 0;
    if (this.highCpuSamples >= SAFETY_LIMITS.apiCpuSamples)
      throw new Error("SAFETY_ABORT: sustained API CPU limit reached");
  }
}
