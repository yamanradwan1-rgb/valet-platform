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
