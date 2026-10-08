import { X509Certificate } from "node:crypto";

import { Pool, type PoolClient, type PoolConfig } from "pg";

import { runtimePostgresPolicy } from "./runtime-postgres-policy";
import { boundPostgresPool } from "./bounded-postgres-pool";

export type PostgresPool = Pool;
export type PostgresTransaction = PoolClient;

interface RuntimeDatabaseSafetyRow {
  readonly can_create_database: boolean;
  readonly can_create_public_schema: boolean;
  readonly database_row_count: number;
  readonly owns_application_objects: boolean;
  readonly owns_database: boolean;
  readonly owns_public_schema: boolean;
  readonly public_schema_row_count: number;
  readonly rolbypassrls: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolreplication: boolean;
  readonly role_row_count: number;
  readonly rolsuper: boolean;
  readonly ssl: boolean | null;
  readonly ssl_row_count: number;
  readonly tls_version: string | null;
}

const acceptedTlsVersions = new Set(["TLSv1.2", "TLSv1.3"]);
const pemCertificatePattern =
  /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

function validatedRuntimeCa(value: string): string {
  if (value.trim() === "") {
    throw new Error("Production database TLS CA material is invalid.");
  }
  const certificates = value.match(pemCertificatePattern) ?? [];
  const remainder = value.replace(pemCertificatePattern, "").trim();
  if (certificates.length === 0 || remainder !== "") {
    throw new Error("Production database TLS CA material is invalid.");
  }
  try {
    for (const pem of certificates) {
      if (!new X509Certificate(pem).ca) {
        throw new Error("not a CA");
      }
    }
  } catch {
    throw new Error("Production database TLS CA material is invalid.");
  }
  return value;
}

export function createRuntimePostgresPool(
  databaseUrl = process.env.DATABASE_URL,
  environment: NodeJS.ProcessEnv = process.env,
): PostgresPool {
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    throw new Error("Application runtime requires DATABASE_URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Application runtime requires a valid DATABASE_URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Application runtime requires a PostgreSQL DATABASE_URL.");
  }
  if (parsed.search !== "") {
    throw new Error(
      "Application runtime DATABASE_URL must not contain query parameters.",
    );
  }
  if (parsed.hash !== "") {
    throw new Error(
      "Application runtime DATABASE_URL must not contain a URL fragment.",
    );
  }
  if (parsed.username === "") {
    throw new Error("Application runtime DATABASE_URL requires a username.");
  }
  if (parsed.password === "") {
    throw new Error("Application runtime DATABASE_URL requires a password.");
  }
  if (parsed.pathname.length <= 1) {
    throw new Error(
      "Application runtime DATABASE_URL requires a database name.",
    );
  }

  const poolConfig: PoolConfig = { connectionString: databaseUrl };
  if (environment.NODE_ENV === "production") {
    if (environment.MIGRATION_DATABASE_URL !== undefined) {
      throw new Error(
        "Production application runtime must not receive MIGRATION_DATABASE_URL.",
      );
    }
    const ca =
      environment.DATABASE_TLS_CA_PEM === undefined
        ? undefined
        : validatedRuntimeCa(environment.DATABASE_TLS_CA_PEM);
    poolConfig.ssl =
      ca === undefined
        ? { rejectUnauthorized: true }
        : { ca, rejectUnauthorized: true };
  }

  const policy = runtimePostgresPolicy(environment);
  return boundPostgresPool(
    new Pool({ ...poolConfig, ...policy.config }),
    policy.config.max!,
    policy.maxWaiters,
    policy.general,
  );
}

export async function inspectRuntimeDatabaseSafety(
  pool: Pick<PostgresPool, "query">,
): Promise<RuntimeDatabaseSafetyRow> {
  const result = await pool.query<RuntimeDatabaseSafetyRow>(
    `WITH current_role_metadata AS (
       SELECT oid, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
              rolbypassrls
       FROM pg_roles
       WHERE rolname = current_user
     ), current_database_metadata AS (
       SELECT datdba FROM pg_database WHERE datname = current_database()
     ), public_schema_metadata AS (
       SELECT oid, nspowner FROM pg_namespace WHERE nspname = 'public'
     ), backend_ssl AS (
       SELECT ssl, version FROM pg_stat_ssl WHERE pid = pg_backend_pid()
     )
     SELECT
       (SELECT count(*)::integer FROM backend_ssl) AS ssl_row_count,
       (SELECT ssl FROM backend_ssl) AS ssl,
       (SELECT version FROM backend_ssl) AS tls_version,
       (SELECT count(*)::integer FROM current_role_metadata) AS role_row_count,
       role.rolsuper,
       role.rolcreatedb,
       role.rolcreaterole,
       role.rolreplication,
       role.rolbypassrls,
       (SELECT count(*)::integer FROM current_database_metadata)
         AS database_row_count,
       (SELECT count(*)::integer FROM public_schema_metadata)
         AS public_schema_row_count,
       database_metadata.datdba = role.oid AS owns_database,
       schema_metadata.nspowner = role.oid AS owns_public_schema,
       has_database_privilege(current_user, current_database(), 'CREATE')
         AS can_create_database,
       has_schema_privilege(current_user, 'public', 'CREATE')
         AS can_create_public_schema,
       EXISTS (
         SELECT 1
         FROM pg_class AS object
         WHERE object.relnamespace = schema_metadata.oid
           AND object.relowner = role.oid
           AND object.relkind IN ('r', 'p', 'S')
       ) OR EXISTS (
         SELECT 1
         FROM pg_proc AS function
         WHERE function.pronamespace = schema_metadata.oid
           AND function.proowner = role.oid
       ) AS owns_application_objects
     FROM current_role_metadata AS role
     CROSS JOIN current_database_metadata AS database_metadata
     CROSS JOIN public_schema_metadata AS schema_metadata`,
  );
  const row = result.rows[0];
  if (result.rowCount !== 1 || row === undefined) {
    throw new Error("Production database safety metadata is incomplete.");
  }
  return row;
}

export function assertProductionRuntimeTlsSafety(
  safety: RuntimeDatabaseSafetyRow,
): void {
  if (
    safety.ssl_row_count !== 1 ||
    safety.ssl !== true ||
    safety.tls_version === null ||
    !acceptedTlsVersions.has(safety.tls_version)
  ) {
    throw new Error(
      "Production database connection is not securely encrypted.",
    );
  }
}

export function assertProductionRuntimeRoleSafety(
  safety: RuntimeDatabaseSafetyRow,
): void {
  if (
    safety.role_row_count !== 1 ||
    safety.database_row_count !== 1 ||
    safety.public_schema_row_count !== 1 ||
    safety.rolsuper !== false ||
    safety.rolcreatedb !== false ||
    safety.rolcreaterole !== false ||
    safety.rolreplication !== false ||
    safety.rolbypassrls !== false ||
    safety.owns_database !== false ||
    safety.owns_public_schema !== false ||
    safety.can_create_database !== false ||
    safety.can_create_public_schema !== false ||
    safety.owns_application_objects !== false
  ) {
    throw new Error("Production database runtime role is unsafe.");
  }
}

export async function verifyProductionRuntimeDatabaseSafety(
  pool: Pick<PostgresPool, "query">,
): Promise<void> {
  let safety: RuntimeDatabaseSafetyRow;
  try {
    safety = await inspectRuntimeDatabaseSafety(pool);
  } catch {
    throw new Error("Production database safety verification failed.");
  }
  assertProductionRuntimeTlsSafety(safety);
  assertProductionRuntimeRoleSafety(safety);
}
