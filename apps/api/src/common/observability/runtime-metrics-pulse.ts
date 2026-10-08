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

const INTERVAL_MS = 30_000;

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
    total: snapshot.total,
    idle: snapshot.idle,
    waiting: snapshot.waiting,
    acquisitions: snapshot.acquisitions ?? 0,
    acquisitionsOver200Ms: snapshot.acquisitionsOver200Ms ?? 0,
    rejected: snapshot.rejected ?? 0,
    failures: snapshot.failures ?? 0,
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
