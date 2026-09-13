import { readFile } from "node:fs/promises";
import { cpus } from "node:os";

import type { Pool } from "pg";

import type { RequestSample, SafetySnapshot } from "./capacity-types";

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

interface CpuReading {
  readonly processTicks: number;
  readonly totalTicks: number;
}

async function readCpu(pid: number): Promise<CpuReading> {
  const [processStat, systemStat] = await Promise.all([
    readFile(`/proc/${pid}/stat`, "utf8"),
    readFile("/proc/stat", "utf8"),
  ]);
  const processFields = processStat.trim().split(/\s+/);
  const cpuFields = systemStat.split("\n")[0]?.trim().split(/\s+/) ?? [];
  return {
    processTicks: Number(processFields[13]) + Number(processFields[14]),
    totalTicks: cpuFields
      .slice(1)
      .reduce((sum, value) => sum + Number(value), 0),
  };
}

async function readRss(pid: number): Promise<number> {
  const status = await readFile(`/proc/${pid}/status`, "utf8");
  const kib = Number(/^VmRSS:\s+(\d+)\s+kB$/m.exec(status)?.[1] ?? NaN);
  if (!Number.isFinite(kib)) throw new Error("API RSS is unavailable.");
  return kib * 1024;
}

export class CapacitySafetyMonitor {
  private consecutiveErrors = 0;
  private highCpuSamples = 0;
  private lastCpu: CpuReading | undefined;
  private requestCount = 0;
  readonly snapshots: SafetySnapshot[] = [];
  private readonly startedAt = Date.now();

  constructor(
    private readonly pool: Pool,
    private readonly apiPid?: number,
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
    let apiCpuPercent: number | null = null;
    let apiRssBytes: number | null = null;
    if (this.apiPid !== undefined) {
      const [cpu, rss] = await Promise.all([
        readCpu(this.apiPid),
        readRss(this.apiPid),
      ]);
      apiRssBytes = rss;
      if (this.lastCpu !== undefined) {
        const processDelta = cpu.processTicks - this.lastCpu.processTicks;
        const totalDelta = cpu.totalTicks - this.lastCpu.totalTicks;
        apiCpuPercent = Number(
          (
            (processDelta / Math.max(1, totalDelta)) *
            cpus().length *
            100
          ).toFixed(2),
        );
      }
      this.lastCpu = cpu;
    }
    const snapshot = {
      apiCpuPercent,
      apiRssBytes,
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
