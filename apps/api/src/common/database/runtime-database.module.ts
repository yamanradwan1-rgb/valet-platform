import {
  Inject,
  Injectable,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import {
  createRuntimePostgresPool,
  type PostgresPool,
  verifyProductionRuntimeDatabaseSafety,
} from "./postgres";

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
    const result = await this.pool.query<{
      version: number;
      transaction_timeout: string;
      statement_timeout: string;
      lock_timeout: string;
      idle_timeout: string;
    }>(
      `SELECT current_setting('server_version_num')::int AS version,
       current_setting('transaction_timeout') AS transaction_timeout,
       current_setting('statement_timeout') AS statement_timeout,
       current_setting('lock_timeout') AS lock_timeout,
       current_setting('idle_in_transaction_session_timeout') AS idle_timeout`,
    );
    if (
      (result.rows[0]?.version ?? 0) < 170000 ||
      result.rows[0]?.transaction_timeout !== "5s" ||
      result.rows[0]?.statement_timeout !== "3s" ||
      result.rows[0]?.lock_timeout !== "2s" ||
      result.rows[0]?.idle_timeout !== "2s"
    )
      throw new Error(
        "Runtime database requires verified PostgreSQL 17 transaction deadlines.",
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
