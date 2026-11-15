import { Inject, Injectable, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { createRuntimePostgresPool, type PostgresPool, verifyProductionRuntimeDatabaseSafety } from "./postgres";

export const STAFF_AUTH_WRITER_POOL = Symbol("STAFF_AUTH_WRITER_POOL");
const expectedWriterRole = "vaylet_staff_auth_writer";

export function assertStaffAuthWriterCredentials(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.STAFF_AUTH_WRITER_DATABASE_URL;
  if (!raw?.trim()) throw new Error("Staff Auth writer requires STAFF_AUTH_WRITER_DATABASE_URL.");
  const parse = (value: string | undefined, name: string): URL => {
    if (!value) throw new Error(`Staff Auth writer requires ${name}.`);
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(`Invalid ${name}.`); }
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.search || url.hash ||
        !url.username || !url.password || !url.hostname || url.pathname.length <= 1) {
      throw new Error(`Invalid ${name}.`);
    }
    return url;
  };
  const writer = parse(raw, "STAFF_AUTH_WRITER_DATABASE_URL");
  const ordinary = parse(env.DATABASE_URL, "DATABASE_URL");
  const sameTarget = (left: URL, right: URL) =>
    left.hostname.toLowerCase() === right.hostname.toLowerCase() &&
    (left.port || "5432") === (right.port || "5432") &&
    decodeURIComponent(left.pathname) === decodeURIComponent(right.pathname);
  if (!sameTarget(writer, ordinary) || decodeURIComponent(writer.username) !== expectedWriterRole ||
      decodeURIComponent(writer.username) === decodeURIComponent(ordinary.username) ||
      decodeURIComponent(writer.password) === decodeURIComponent(ordinary.password) ||
      raw === env.DATABASE_URL || raw === env.MIGRATION_DATABASE_URL) {
    throw new Error("Staff Auth writer credentials must use a separate role and secret on the same database.");
  }
  if (env.MIGRATION_DATABASE_URL) {
    const migration = parse(env.MIGRATION_DATABASE_URL, "MIGRATION_DATABASE_URL");
    if (!sameTarget(writer, migration) ||
        decodeURIComponent(writer.username) === decodeURIComponent(migration.username) ||
        decodeURIComponent(writer.password) === decodeURIComponent(migration.password)) {
      throw new Error("Staff Auth writer credentials must be isolated from migration credentials.");
    }
  }
  return raw;
}

export function createStaffAuthWriterPool(): PostgresPool {
  const url = assertStaffAuthWriterCredentials();
  const rawMax = process.env.STAFF_AUTH_WRITER_POOL_MAX ??
    (process.env.NODE_ENV === "production" ? "" : "2");
  if (!/^[1-9]\d?$/.test(rawMax) || Number(rawMax) > 8) {
    throw new Error("Staff Auth writer pool capacity must be between 1 and 8.");
  }
  const writerMax = Number(rawMax);
  if (process.env.NODE_ENV === "production") {
    const total = Number(process.env.DATABASE_ALLOWED_CONNECTIONS) -
      Number(process.env.DATABASE_RESERVED_CONNECTIONS);
    const instances = Number(process.env.DATABASE_MAX_API_INSTANCES);
    const ordinaryMax = Number(process.env.DATABASE_POOL_MAX);
    if (![total, instances, ordinaryMax].every(
      (number) => Number.isSafeInteger(number) && number > 0,
    ) || (ordinaryMax + writerMax) * instances > total) {
      throw new Error("Staff Auth writer exceeds the database connection budget.");
    }
  }
  return createRuntimePostgresPool(url, {
    ...process.env,
    DATABASE_POOL_MAX: rawMax,
    DATABASE_POOL_MAX_WAITERS: String(Math.min(32 * writerMax, 256)),
  });
}

@Injectable()
export class StaffAuthWriterLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(@Inject(STAFF_AUTH_WRITER_POOL) private readonly pool: PostgresPool) {}

  async onApplicationBootstrap(): Promise<void> {
    const result = await this.pool.query<{role: string; inherited: boolean}>(
      `SELECT current_user AS role,
              EXISTS (SELECT 1 FROM pg_auth_members WHERE member =
                (SELECT oid FROM pg_roles WHERE rolname=current_user)) AS inherited`,
    );
    if (result.rows[0]?.role !== expectedWriterRole || result.rows[0].inherited) {
      throw new Error("Staff Auth writer PostgreSQL principal is unsafe.");
    }
    if (process.env.NODE_ENV === "production") {
      await verifyProductionRuntimeDatabaseSafety(this.pool);
    }
  }

  async onApplicationShutdown(): Promise<void> { await this.pool.end(); }
}

@Module({
  providers: [
    StaffAuthWriterLifecycle,
    { provide: STAFF_AUTH_WRITER_POOL, useFactory: createStaffAuthWriterPool },
  ],
  exports: [STAFF_AUTH_WRITER_POOL],
})
export class StaffAuthWriterDatabaseModule {}
