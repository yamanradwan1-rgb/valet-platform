import { randomBytes } from "node:crypto";

import { Pool } from "pg";

import { startProductionDatabaseSafetyContainer } from "./production-database-safety-container";

type FixtureEnvironmentKey =
  | "TEST_DATABASE_URL"
  | "STAFF_AUTH_TEST_MIGRATION_BASE_URL"
  | "VAYLET_CI_POSTGRES_BOOTSTRAP_URL"
  | "VAYLET_CI_MANAGEMENT_WRITER_PASSWORD"
  | "VAYLET_TEST_RUN_ID";

const fixtureKeys: readonly FixtureEnvironmentKey[] = [
  "TEST_DATABASE_URL",
  "STAFF_AUTH_TEST_MIGRATION_BASE_URL",
  "VAYLET_CI_POSTGRES_BOOTSTRAP_URL",
  "VAYLET_CI_MANAGEMENT_WRITER_PASSWORD",
  "VAYLET_TEST_RUN_ID",
];

function writerUrl(applicationUrl: string, role: string, secret: string) {
  const url = new URL(applicationUrl);
  url.username = role;
  url.password = secret;
  return url.toString();
}

export async function startLocalMfaBypassCluster() {
  // A development API requires the canonical Staff Auth writer role. Its
  // cluster-wide credential must never be rotated in the shared CI service.
  const disposable = await startProductionDatabaseSafetyContainer();
  const previous = new Map(
    fixtureKeys.map((key) => [key, process.env[key]] as const),
  );
  const migratorSecret = randomBytes(32).toString("hex");
  const managementSecret = randomBytes(32).toString("hex");
  const staffWriterSecret = randomBytes(32).toString("hex");
  const admin = new Pool({ connectionString: disposable.adminUrl, max: 1 });
  let adminClosed = false;
  let environmentSet = false;
  const restore = () => {
    if (!environmentSet) return;
    environmentSet = false;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  try {
    const secondaryRunId = disposable.secondaryRunId;
    const parentRunId =
      process.env.VAYLET_TEST_RUN_ID ??
      process.env.VAYLET_TEST_CLUSTER_RUN_ID;
    if (parentRunId !== undefined) {
      if (
        !secondaryRunId ||
        secondaryRunId === parentRunId ||
        disposable.childEnvironment.VAYLET_TEST_RUN_ID !== secondaryRunId ||
        disposable.childEnvironment.TEST_DATABASE_URL !== disposable.adminUrl
      ) {
        throw new Error("Local MFA bypass requires an attested secondary PostgreSQL ownership run.");
      }
    } else if (secondaryRunId !== undefined) {
      throw new Error("Secondary PostgreSQL ownership cannot outlive its parent harness.");
    }
    const verified = await admin.query<{
      readonly database: string;
      readonly principal: string;
      readonly version: number;
    }>(
      `SELECT current_database() AS database, current_user AS principal,
              current_setting('server_version_num')::integer AS version`,
    );
    const identity = verified.rows[0];
    if (
      identity?.database !== "postgres" || identity.principal !== "postgres" ||
      identity.version < 170000 || identity.version >= 180000
    ) {
      throw new Error("Local MFA bypass fixture requires disposable PostgreSQL 17.");
    }
    await admin.query(
      `CREATE ROLE vap1_proof_owner NOLOGIN NOINHERIT
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    await admin.query(
      `CREATE ROLE vaylet_staff_session_lock_owner NOLOGIN NOINHERIT
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
    );
    const roleSql = await admin.query<{ readonly statement: string }>(
      `SELECT pg_catalog.format(
         'CREATE ROLE vaylet_management_writer LOGIN PASSWORD %L NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
         $1::text
       ) AS statement`,
      [managementSecret],
    );
    await admin.query(roleSql.rows[0]!.statement);
    const migratorSql = await admin.query<{ readonly statement: string }>(
      `SELECT pg_catalog.format(
         'CREATE ROLE valet LOGIN PASSWORD %L NOINHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS',
         $1::text
       ) AS statement`,
      [migratorSecret],
    );
    await admin.query(migratorSql.rows[0]!.statement);
    await admin.query(
      `GRANT vap1_proof_owner, vaylet_staff_session_lock_owner,
             vaylet_management_writer TO valet
       WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
    );
    // The CI child hook acquires its cluster-wide S04 writer advisory lock
    // against /valet, never /postgres. The scratch databases share this host.
    await admin.query("CREATE DATABASE valet OWNER valet");
    const bootstrapUrl = new URL(disposable.adminUrl);
    bootstrapUrl.pathname = "/valet";
    const migratorUrl = writerUrl(bootstrapUrl.toString(), "valet", migratorSecret);
    process.env.TEST_DATABASE_URL = migratorUrl;
    process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL = migratorUrl;
    process.env.VAYLET_CI_POSTGRES_BOOTSTRAP_URL = migratorUrl;
    process.env.VAYLET_CI_MANAGEMENT_WRITER_PASSWORD = managementSecret;
    if (secondaryRunId !== undefined) {
      process.env.VAYLET_TEST_RUN_ID = secondaryRunId;
    }
    environmentSet = true;
    await admin.end();
    adminClosed = true;
    return {
      writerEnvironment(applicationUrl: string): Record<string, string> {
        return {
          STAFF_AUTH_WRITER_DATABASE_URL: writerUrl(
            applicationUrl, "vaylet_staff_auth_writer", staffWriterSecret,
          ),
          MANAGEMENT_WRITER_DATABASE_URL: writerUrl(
            applicationUrl, "vaylet_management_writer", managementSecret,
          ),
        };
      },
      async stop() {
        try {
          await disposable.stop();
        } finally {
          restore();
        }
      },
    };
  } catch (error) {
    if (!adminClosed) {
      try {
        await admin.end();
      } catch {
        // Preserve the primary provisioning error.
      }
    }
    let disposalFailure: unknown;
    try {
      await disposable.stop();
    } catch (stopError) {
      disposalFailure = stopError;
    } finally {
      restore();
    }
    if (disposalFailure !== undefined) {
      throw new AggregateError(
        [error, disposalFailure],
        "Local MFA bypass provisioning and disposable PostgreSQL cleanup failed.",
      );
    }
    throw error;
  }
}
