import {
  Inject, Injectable, Module, type OnApplicationBootstrap, type OnApplicationShutdown,
} from "@nestjs/common";
import {
  createRuntimePostgresPool, type PostgresPool,
  verifyProductionRuntimeDatabaseSafety,
} from "../../../common/database/postgres";

export const OUTBOUND_WEBHOOK_POOL = Symbol("OUTBOUND_WEBHOOK_POOL");

function username(source: string, value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error(`WhatsApp webhook requires valid ${source}.`); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.username ||
      !parsed.password || parsed.search || parsed.hash) {
    throw new Error(`WhatsApp webhook requires valid ${source}.`);
  }
  return decodeURIComponent(parsed.username);
}

/** No shared API, sender, migration or database-owner credential is accepted. */
export function createWebhookDatabasePool(
  env: NodeJS.ProcessEnv,
): PostgresPool | null {
  const url = env.OUTBOUND_MESSAGING_WEBHOOK_DATABASE_URL;
  if (!url) return null;
  const principal = username("OUTBOUND_MESSAGING_WEBHOOK_DATABASE_URL", url);
  for (const key of ["DATABASE_URL", "OUTBOUND_MESSAGING_WORKER_DATABASE_URL",
    "MIGRATION_DATABASE_URL"] as const) {
    if (env[key] && username(key, env[key]!) === principal)
      throw new Error("WhatsApp webhook requires a distinct restricted database principal.");
  }
  return createRuntimePostgresPool(url, env);
}

@Injectable()
export class WebhookDatabaseLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(OUTBOUND_WEBHOOK_POOL) private readonly pool: PostgresPool | null) {}
  async onApplicationBootstrap() {
    if (this.pool && process.env.NODE_ENV === "production") {
      await verifyProductionRuntimeDatabaseSafety(this.pool);
    }
  }
  async onApplicationShutdown() { await this.pool?.end(); }
}

@Module({
  providers: [{
    provide: OUTBOUND_WEBHOOK_POOL,
    useFactory: () => createWebhookDatabasePool(process.env),
  }, WebhookDatabaseLifecycle],
  exports: [OUTBOUND_WEBHOOK_POOL],
})
export class OutboundWebhookDatabaseModule {}
