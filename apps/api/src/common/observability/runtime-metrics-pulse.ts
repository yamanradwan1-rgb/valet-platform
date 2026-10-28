import {
  Injectable,
  Inject,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import type { PostgresPool } from "../database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../database/runtime-database.module";
import { runtimePoolSnapshot } from "../database/bounded-postgres-pool";
import { readLimiterMaintenanceSnapshot } from "./limiter-maintenance-metrics";
import { performance } from "node:perf_hooks";
import {
  postgresPhases,
  resetFailureReasons,
} from "../database/postgres-lifecycle-diagnostics";
import { databaseOperations } from "./database-operation-context";

const INTERVAL_MS = 30_000;

function vector(values: number[] | undefined, length: number): number[] {
  return values ?? Array.from({ length }, () => 0);
}

function releaseIdentity(): string {
  const value = process.env.VAYLET_RELEASE_GIT_SHA ?? "";
  return /^[0-9a-f]{40}$/.test(value) ? value : "UNVERIFIED";
}

/** Fixed-schema interval sample, suitable for external log-to-metrics ingestion. */
export function readRuntimeMetrics(pool: PostgresPool) {
  const snapshot = runtimePoolSnapshot(pool);
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const limiter = readLimiterMaintenanceSnapshot();
  return {
    pid: process.pid,
    processStartedAtMs: Math.floor(performance.timeOrigin),
    sampledAtMs: Date.now(),
    total: snapshot.total,
    idle: snapshot.idle,
    waiting: snapshot.waiting,
    configuredMax: snapshot.configuredMax ?? 0,
    queueCapacity: snapshot.queueCapacity ?? 0,
    active: snapshot.active,
    leased: snapshot.leased ?? 0,
    admitted: snapshot.admitted ?? 0,
    acquiring: snapshot.acquiring ?? 0,
    acquisitionMs: Math.round(snapshot.acquisitionMs ?? 0),
    nativeAcquisitionMs: Math.round(snapshot.nativeAcquisitionMs ?? 0),
    nativeAcquisitionAttempts: snapshot.nativeAcquisitionAttempts ?? 0,
    peakAdmitted: snapshot.peakAdmitted ?? 0,
    peakWaiting: snapshot.peakWaiting ?? 0,
    peakActive: snapshot.peakActive ?? 0,
    peakIdle: snapshot.peakIdle ?? 0,
    peakLeased: snapshot.peakLeased ?? 0,
    leaseCompletions: snapshot.leaseCompletions ?? 0,
    leaseMs: Math.round(snapshot.leaseMs ?? 0),
    leaseBuckets: snapshot.leaseBuckets ?? [0, 0, 0, 0, 0, 0, 0],
    phaseCounts: vector(snapshot.phaseCounts, postgresPhases.length),
    phaseMs: vector(snapshot.phaseMs, postgresPhases.length).map(Math.round),
    phaseMaxMs: vector(snapshot.phaseMaxMs, postgresPhases.length).map(
      Math.round,
    ),
    activeByPhase: vector(snapshot.activeByPhase, postgresPhases.length),
    oldestLeaseByPhaseMs: vector(
      snapshot.oldestLeaseByPhaseMs,
      postgresPhases.length,
    ).map(Math.round),
    oldestQueryByPhaseMs: vector(
      snapshot.oldestQueryByPhaseMs,
      postgresPhases.length,
    ).map(Math.round),
    activeByOperation: vector(
      snapshot.activeByOperation,
      databaseOperations.length,
    ),
    operationLeases: vector(
      snapshot.operationLeases,
      databaseOperations.length,
    ),
    operationLeaseMs: vector(
      snapshot.operationLeaseMs,
      databaseOperations.length,
    ).map(Math.round),
    operationLeaseMaxMs: vector(
      snapshot.operationLeaseMaxMs,
      databaseOperations.length,
    ).map(Math.round),
    operationAcquisitions: vector(
      snapshot.operationAcquisitions,
      databaseOperations.length,
    ),
    operationAcquisitionMs: vector(
      snapshot.operationAcquisitionMs,
      databaseOperations.length,
    ).map(Math.round),
    operationAcquisitionTimeouts: vector(
      snapshot.operationAcquisitionTimeouts,
      databaseOperations.length,
    ),
    resetFailureReasons: vector(
      snapshot.resetFailureReasons,
      resetFailureReasons.length,
    ),
    resetFailuresAfterDisposal: snapshot.resetFailuresAfterDisposal ?? 0,
    resetsInterrupted: snapshot.resetsInterrupted ?? 0,
    queryCounts: snapshot.queryCounts ?? [0, 0, 0, 0],
    queryMs: (snapshot.queryMs ?? [0, 0, 0, 0]).map((value) =>
      Math.round(value),
    ),
    acquisitionTimeouts: snapshot.acquisitionTimeouts ?? 0,
    connectionFailures: snapshot.connectionFailures ?? 0,
    leaseSetupFailures: snapshot.leaseSetupFailures ?? 0,
    expiredAcquisitions: snapshot.expiredAcquisitions ?? 0,
    releaseFailures: snapshot.releaseFailures ?? 0,
    leaseExpirations: snapshot.leaseExpirations ?? 0,
    queryTimeouts: snapshot.queryTimeouts ?? 0,
    acquisitions: snapshot.acquisitions ?? 0,
    acquisitionsOver200Ms: snapshot.acquisitionsOver200Ms ?? 0,
    rejected: snapshot.rejected ?? 0,
    failures: snapshot.failures ?? 0,
    initializationFailures: snapshot.initializationFailures ?? 0,
    poolErrors: snapshot.poolErrors ?? 0,
    clientErrors: snapshot.clientErrors ?? 0,
    statementTimeouts: snapshot.statementTimeouts ?? 0,
    lockTimeouts: snapshot.lockTimeouts ?? 0,
    transactionTimeouts: snapshot.transactionTimeouts ?? 0,
    acquisitionBuckets: snapshot.acquisitionBuckets ?? [0, 0, 0, 0, 0, 0],
    rssBytes: memory.rss,
    heapBytes: memory.heapUsed,
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    limiterCleanupRuns: limiter.runs,
    limiterDeletedRows: limiter.deleted,
    limiterCleanupFailures: limiter.failures,
    limiterCleanupDurationMs: Math.round(limiter.durationMs),
    limiterEligibleBacklogSample: limiter.expiredSample,
    limiterOldestExpiredAgeSeconds: limiter.oldestExpiredAgeSeconds,
    releaseSha: releaseIdentity(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

export function formatRuntimeMetrics(
  values: ReturnType<typeof readRuntimeMetrics>,
): string {
  // Only trusted numeric counters and fixed keys. No secrets, host, SQL or tenant.
  const fields = Object.entries(values).map(([name, value]) => {
    const numeric = Array.isArray(value) ? value.join(",") : value;
    return `${name}=${numeric}`;
  });
  return `RUNTIME_METRIC ${fields.join(" ")}`;
}

@Injectable()
export class RuntimeMetricsPulse implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("RuntimeMetrics");
  private interval: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => {
      try {
        this.logger.log(formatRuntimeMetrics(readRuntimeMetrics(this.pool)));
      } catch {
        // Metrics sampling cannot terminate a serving process.
      }
    }, INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
  }
}
