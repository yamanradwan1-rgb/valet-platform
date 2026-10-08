import { inPostgresTransaction } from "../../common/database/postgres-transaction";
import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import type { PostgresPool } from "../../common/database/postgres";
import { RUNTIME_POSTGRES_POOL } from "../../common/database/runtime-database.module";
import { recordLimiterMaintenanceSnapshot } from "../../common/observability/limiter-maintenance-metrics";

@Injectable()
export class AntiAbuseMaintenance implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private inFlight: Promise<void> | undefined;
  readonly measurements = {
    runs: 0,
    deleted: 0,
    failures: 0,
    durationMs: 0,
    expiredSample: 0,
    oldestExpiredAgeSeconds: 0,
  };

  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.run();
    }, 1000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.inFlight;
  }

  async run(): Promise<void> {
    if (this.inFlight !== undefined) return this.inFlight;
    this.inFlight = this.batch();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  private async batch(): Promise<void> {
    const started = performance.now();
    try {
      const result = await inPostgresTransaction(
        this.pool,
        async (transaction) => {
          await transaction.query("SET LOCAL statement_timeout = '500ms'");
          const result = await transaction.query<{ deleted: number }>(
            "SELECT cleanup_expired_anti_abuse_events() AS deleted",
          );
          const backlog = await transaction.query<{
            count: number;
            age: number;
          }>(
            `SELECT count(*)::int AS count, COALESCE(EXTRACT(epoch FROM (clock_timestamp()-min(occurred_at))),0)::int AS age
           FROM (SELECT occurred_at FROM anti_abuse_events WHERE occurred_at < clock_timestamp()-interval '1 hour'
             ORDER BY occurred_at LIMIT 1001) AS expired`,
          );
          this.measurements.expiredSample = backlog.rows[0]?.count ?? 0;
          this.measurements.oldestExpiredAgeSeconds = backlog.rows[0]?.age ?? 0;
          return result;
        },
      );
      this.measurements.runs += 1;
      this.measurements.deleted += result.rows[0]?.deleted ?? 0;
    } catch {
      this.measurements.failures += 1;
    } finally {
      this.measurements.durationMs += performance.now() - started;
      recordLimiterMaintenanceSnapshot(this.measurements);
    }
  }
}
