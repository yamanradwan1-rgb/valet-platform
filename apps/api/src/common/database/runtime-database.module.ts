import { withDatabaseOperationDeadline } from "./runtime-database-deadline";
import {
  Inject,
  Injectable,
  Module,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import {
  createRuntimePostgresPool,
  type PostgresPool,
  verifyProductionRuntimeDatabaseSafety,
} from "./postgres";

import { runtimePoolMeasurements } from "./bounded-postgres-pool";
import { databaseFailureReason } from "./database-failure-reason";

export const RUNTIME_POSTGRES_POOL = Symbol("RUNTIME_POSTGRES_POOL");

export function createRuntimePool(): PostgresPool {
  return createRuntimePostgresPool(process.env.DATABASE_URL);
}

@Injectable()
export class RuntimeDatabaseLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(RUNTIME_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.verifyRuntimeDatabase();
    } catch (error) {
      const counters = runtimePoolMeasurements.get(this.pool);
      if (counters) counters.initializationFailures += 1;
      try {
        new Logger("RuntimeDatabase").error(
          `DATABASE_INITIALIZATION_FAILED reason=${databaseFailureReason(error) ?? "SAFETY_PREFLIGHT"}`,
        );
      } catch {
        // A failed diagnostic must not replace the original startup failure.
      }
      throw error;
    }
  }

  private async verifyRuntimeDatabase(): Promise<void> {
    const result = await withDatabaseOperationDeadline(() =>
      this.pool.query<{
        version: number;
        transaction_timeout: string | null;
        statement_timeout: string;
        lock_timeout: string;
        idle_timeout: string;
      }>(
        `SELECT current_setting('server_version_num')::int AS version,
       current_setting('transaction_timeout', true) AS transaction_timeout,
       current_setting('statement_timeout') AS statement_timeout,
       current_setting('lock_timeout') AS lock_timeout,
       current_setting('idle_in_transaction_session_timeout') AS idle_timeout`,
      ),
    );
    if (
      (result.rows[0]?.version ?? 0) < 160000 ||
      ((result.rows[0]?.version ?? 0) >= 170000 &&
        !["0", "0ms", "5s"].includes(
          result.rows[0]?.transaction_timeout ?? "",
        )) ||
      ((result.rows[0]?.version ?? 0) < 170000 &&
        result.rows[0]?.transaction_timeout !== null) ||
      result.rows[0]?.statement_timeout !== "3s" ||
      result.rows[0]?.lock_timeout !== "2s" ||
      result.rows[0]?.idle_timeout !== "2s"
    )
      throw new Error(
        "Runtime database requires PostgreSQL 16+ with verified supported deadlines.",
      );
    if (process.env.NODE_ENV === "production") {
      await verifyProductionRuntimeDatabaseSafety(this.pool);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    RuntimeDatabaseLifecycle,
    { provide: RUNTIME_POSTGRES_POOL, useFactory: createRuntimePool },
  ],
  exports: [RUNTIME_POSTGRES_POOL],
})
export class RuntimeDatabaseModule {}
