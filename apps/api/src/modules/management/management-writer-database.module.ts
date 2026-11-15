import {
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";

import {
  createRuntimePostgresPool,
  type PostgresPool,
  verifyProductionRuntimeDatabaseSafety,
} from "../../common/database/postgres";

export const MANAGEMENT_POSTGRES_POOL = Symbol("MANAGEMENT_POSTGRES_POOL");
const MANAGEMENT_WRITER_ROLE = "vaylet_management_writer";

function managementPoolCapacity(environment: NodeJS.ProcessEnv): number {
  const text = environment.MANAGEMENT_WRITER_POOL_MAX ?? "2";
  if (!/^[1-9][0-9]?$/.test(text)) {
    throw new Error("Management writer pool requires a bounded connection count.");
  }
  const max = Number(text);
  if (max > 8) {
    throw new Error("Management writer pool exceeds the protected connection limit.");
  }
  if (environment.NODE_ENV === "production") {
    const regular = Number(environment.DATABASE_POOL_MAX);
    const instances = Number(environment.DATABASE_MAX_API_INSTANCES);
    const allowed = Number(environment.DATABASE_ALLOWED_CONNECTIONS);
    const reserved = Number(environment.DATABASE_RESERVED_CONNECTIONS);
    if (
      ![regular, instances, allowed, reserved].every(Number.isSafeInteger) ||
      (regular + max) * instances > allowed - reserved
    ) {
      throw new Error("Management writer exceeds database connection capacity.");
    }
  }
  return max;
}

export function createManagementWriterPool(
  environment: NodeJS.ProcessEnv = process.env,
): PostgresPool {
  const regularUrl = environment.DATABASE_URL;
  const writerUrl = environment.MANAGEMENT_WRITER_DATABASE_URL;
  if (!regularUrl || !writerUrl) {
    throw new Error("Management writer requires dedicated DATABASE_URL credentials.");
  }
  let regular: URL;
  let writer: URL;
  try {
    regular = new URL(regularUrl);
    writer = new URL(writerUrl);
  } catch {
    throw new Error("Management writer database configuration is invalid.");
  }
  if (
    decodeURIComponent(writer.username) !== MANAGEMENT_WRITER_ROLE ||
    decodeURIComponent(writer.username) === decodeURIComponent(regular.username) ||
    decodeURIComponent(writer.password) === decodeURIComponent(regular.password) ||
    writer.hostname.toLowerCase() !== regular.hostname.toLowerCase() ||
    (writer.port || "5432") !== (regular.port || "5432") ||
    decodeURIComponent(writer.pathname) !== decodeURIComponent(regular.pathname)
  ) {
    throw new Error("Management writer must use isolated credentials on the runtime database.");
  }
  if (environment.MIGRATION_DATABASE_URL) {
    const migrator = new URL(environment.MIGRATION_DATABASE_URL);
    if (
      decodeURIComponent(migrator.username) === MANAGEMENT_WRITER_ROLE ||
      decodeURIComponent(migrator.password) === decodeURIComponent(writer.password)
    ) {
      throw new Error("Management writer cannot share migrator credentials.");
    }
  }
  const max = managementPoolCapacity(environment);
  return createRuntimePostgresPool(writerUrl, {
    ...environment,
    DATABASE_POOL_MAX: String(max),
    DATABASE_POOL_MAX_WAITERS: String(Math.min(64, max * 16)),
  });
}

@Injectable()
export class ManagementWriterDatabaseLifecycle
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ManagementWriterDatabaseLifecycle.name);

  constructor(
    @Inject(MANAGEMENT_POSTGRES_POOL) private readonly pool: PostgresPool,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.pool.query<{
        readonly role: string;
        readonly rolsuper: boolean;
        readonly rolcreatedb: boolean;
        readonly rolcreaterole: boolean;
        readonly rolreplication: boolean;
        readonly rolbypassrls: boolean;
        readonly rolinherit: boolean;
        readonly has_parent_role: boolean;
      }>(
        `SELECT role.rolname AS role, role.rolsuper, role.rolcreatedb,
                role.rolcreaterole, role.rolreplication, role.rolbypassrls,
                role.rolinherit,
                EXISTS (SELECT 1 FROM pg_auth_members AS grant
                        WHERE grant.member=role.oid) AS has_parent_role
         FROM pg_roles AS role WHERE role.rolname=current_user`,
      );
      const current = result.rows[0];
      if (
        current?.role !== MANAGEMENT_WRITER_ROLE ||
        current.rolsuper ||
        current.rolcreatedb ||
        current.rolcreaterole ||
        current.rolreplication ||
        current.rolbypassrls ||
        current.rolinherit ||
        current.has_parent_role
      ) {
        throw new Error("Management writer connected using unexpected SQL authority.");
      }
      if (process.env.NODE_ENV === "production") {
        await verifyProductionRuntimeDatabaseSafety(this.pool);
      }
    } catch {
      this.logger.error("MANAGEMENT_WRITER_INITIALIZATION_FAILED");
      throw new Error("Management writer database could not be verified.");
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [
    ManagementWriterDatabaseLifecycle,
    { provide: MANAGEMENT_POSTGRES_POOL, useFactory: createManagementWriterPool },
  ],
  exports: [MANAGEMENT_POSTGRES_POOL],
})
export class ManagementWriterDatabaseModule {}
