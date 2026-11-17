import { randomUUID } from "node:crypto";

import { Client, Pool } from "pg";

import { runPnpm } from "../staff-auth-native-run-pnpm";
import {
  captureFixtureWriterRoleBaseline,
  captureFixtureWriterRolePostState,
  restoreFixtureWriterRoles,
  type FixtureWriterRoleSnapshot,
} from "../staff-auth-native-writer-role-lifecycle";
import { OptionCT5Fixture } from "../issue416-option-c-t5/probe-fixture";
import { assertOwnedOptionCAfterPg17 } from "../issue416-option-c-t5/owned-target";
import {
  ensureMigrationRole,
  findAbsentMigrationOwnedRoles,
  grantMigrationDatabase,
  migrationBaseUrl,
  optionCTestMigratorRole,
  restoreMigrationOwnedRoles,
} from "./after-migration-topology";

// AFTER tests use a second, named owner-only cluster. BEFORE .probe.ts suites
// retain their separate original target, opt-in switch and failing assertions.
export class OptionCAfterFixture extends OptionCT5Fixture {
  private readonly proofKey = this.proofKeys.sqlProof;
  private readonly writerPasswords = [randomUUID(), randomUUID(), randomUUID()];
  private readonly priorProofKey =
    process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
  private readonly priorS02 = process.env.ISSUE416_S02_PROTECTED_TEST;
  private readonly priorMigrationBase =
    process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL;
  private readonly priorMigrationDatabase = process.env.MIGRATION_DATABASE_URL;
  private readonly migrationPassword = randomUUID();
  private migrationRoleSnapshots: FixtureWriterRoleSnapshot[] = [];
  private fixtureLease: Client | undefined;
  private newMigrationOwnedRoles: string[] = [];
  private fixtureMigrationBaseUrl: string | undefined;

  constructor() {
    super(assertOwnedOptionCAfterPg17);
  }

  override async start(): Promise<void> {
    const ownerUrl = process.env.TEST_DATABASE_URL;
    if (!ownerUrl) throw new Error("W66 owner test URL is unavailable.");
    await assertOwnedOptionCAfterPg17();
    const owner = new Client({ connectionString: ownerUrl });
    try {
      await owner.connect();
      const lease = await owner.query<{ acquired: boolean }>(
        "SELECT pg_catalog.pg_try_advisory_lock(416, 66) AS acquired",
      );
      if (lease.rows[0]?.acquired !== true) {
        throw new Error("W66 disposable PostgreSQL fixture is already in use.");
      }
      this.fixtureLease = owner;
      this.newMigrationOwnedRoles = await findAbsentMigrationOwnedRoles(owner);
      this.migrationRoleSnapshots = await captureFixtureWriterRoleBaseline(
        owner,
        {
          MFA_WRITER_DATABASE_URL: migrationBaseUrl(
            ownerUrl,
            this.migrationPassword,
          ),
        },
      );
      await ensureMigrationRole(ownerUrl, this.migrationPassword);
      this.fixtureMigrationBaseUrl = migrationBaseUrl(
        ownerUrl,
        this.migrationPassword,
      );
      await this.captureMigrationRolePostState();
      process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL =
        this.fixtureMigrationBaseUrl;
      process.env.ISSUE416_S02_PROTECTED_TEST = "1";
      process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL = this.proofKey;
      await super.start();
    } catch (error) {
      this.restoreOptionCEnvironment();
      try {
        await this.restoreMigrationRole();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "W66 fixture setup and cleanup both failed.",
        );
      } finally {
        this.fixtureLease = undefined;
        await owner.end();
      }
      throw error;
    }
  }

  protected override protectedWriterTestEnvironment(applicationUrl: string) {
    const writer = (role: string, password: string) => {
      const url = new URL(applicationUrl);
      url.username = role;
      url.password = password;
      return url.toString();
    };
    return {
      STAFF_AUTH_WRITER_DATABASE_URL: writer(
        "vaylet_staff_auth_writer",
        this.writerPasswords[0]!,
      ),
      MFA_WRITER_DATABASE_URL: writer(
        "vaylet_mfa_writer",
        this.writerPasswords[1]!,
      ),
      MANAGEMENT_WRITER_DATABASE_URL: writer(
        "vaylet_management_writer",
        this.writerPasswords[2]!,
      ),
    };
  }

  protected override async prepareMigrationDatabase(databaseName: string) {
    const ownerUrl = process.env.TEST_DATABASE_URL;
    if (!ownerUrl) throw new Error("W66 owner test URL is unavailable.");
    try {
      await grantMigrationDatabase(
        ownerUrl,
        databaseName,
        this.migrationPassword,
      );
    } finally {
      await this.captureMigrationRolePostState();
    }
  }

  protected override cleanupDatabaseOwnerRole(): string {
    return optionCTestMigratorRole;
  }

  protected override async afterRuntimeProvisioning(
    applicationUrl: string,
    writers: Record<string, string>,
  ) {
    process.env.MIGRATION_DATABASE_URL = this.migrationDatabaseUrl();
    const environment = {
      NODE_ENV: "test",
      DATABASE_URL: applicationUrl,
      MIGRATION_DATABASE_URL: this.migrationDatabaseUrl(),
      ANTI_ABUSE_SQL_PROOF_SECRET_B64URL: this.proofKey,
      ...writers,
    };
    await this.assertLegacyRuntimeDrained(applicationUrl);
    await runPnpm(
      [
        "--filter",
        "@valet/database",
        "exec",
        "node",
        "scripts/provision-option-c-protected-cutover.mjs",
      ],
      {
        ...environment,
        OPTION_C_PROTECTED_CUTOVER: "1",
        OPTION_C_LEGACY_WORKERS_DRAINED: "1",
      },
    );
  }

  private async assertLegacyRuntimeDrained(applicationUrl: string) {
    const runtimeRole = decodeURIComponent(new URL(applicationUrl).username);
    const pool = new Pool({
      connectionString: this.migrationDatabaseUrl(),
      max: 1,
    });
    try {
      const activity = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_catalog.pg_stat_activity
           WHERE datname=pg_catalog.current_database() AND usename=$1`,
        [runtimeRole],
      );
      const prepared = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM pg_catalog.pg_prepared_xacts
           WHERE database=pg_catalog.current_database() AND owner=$1`,
        [runtimeRole],
      );
      const migrations = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM public._prisma_migrations
           WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      );
      if (activity.rows[0]?.count !== "0" || prepared.rows[0]?.count !== "0") {
        throw new Error(
          "W66 legacy runtime drain proof failed before protected cutover.",
        );
      }
      console.info(
        `W66 pre-cutover migrations=${migrations.rows[0]?.count ?? "unknown"} runtime_connections=0 prepared_xacts=0`,
      );
    } finally {
      await pool.end();
    }
  }

  override async stop(): Promise<void> {
    try {
      await super.stop();
    } finally {
      this.restoreOptionCEnvironment();
      try {
        await this.restoreMigrationRole();
      } finally {
        await this.fixtureLease?.end();
        this.fixtureLease = undefined;
      }
    }
  }

  private async captureMigrationRolePostState(): Promise<void> {
    if (!this.fixtureLease)
      throw new Error("W66 fixture lease is unavailable.");
    this.migrationRoleSnapshots = await captureFixtureWriterRolePostState(
      this.fixtureLease,
      this.migrationRoleSnapshots,
    );
  }

  private async restoreMigrationRole(): Promise<void> {
    if (this.migrationRoleSnapshots.length === 0) return;
    if (!this.fixtureLease)
      throw new Error("W66 fixture lease is unavailable.");
    if (
      this.fixtureMigrationBaseUrl &&
      this.newMigrationOwnedRoles.length > 0
    ) {
      await restoreMigrationOwnedRoles(
        this.fixtureMigrationBaseUrl,
        this.newMigrationOwnedRoles,
      );
    }
    await restoreFixtureWriterRoles(
      this.fixtureLease,
      this.migrationRoleSnapshots,
    );
    this.migrationRoleSnapshots = [];
  }

  private restoreOptionCEnvironment() {
    if (this.priorProofKey === undefined)
      delete process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
    else process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL = this.priorProofKey;
    if (this.priorS02 === undefined)
      delete process.env.ISSUE416_S02_PROTECTED_TEST;
    else process.env.ISSUE416_S02_PROTECTED_TEST = this.priorS02;
    if (this.priorMigrationBase === undefined) {
      delete process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL;
    } else {
      process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL = this.priorMigrationBase;
    }
    if (this.priorMigrationDatabase === undefined) {
      delete process.env.MIGRATION_DATABASE_URL;
    } else process.env.MIGRATION_DATABASE_URL = this.priorMigrationDatabase;
  }
}

export async function assertRuntimeDeny(
  fixture: OptionCAfterFixture,
  sql: string,
  values: unknown[] = [],
  retiredFunctionSignature?: string,
): Promise<void> {
  const outcome = await fixture.runtimeSql(sql, values);
  if (outcome.allowed) {
    throw new Error(
      "Option C AFTER runtime SQL mutation unexpectedly succeeded.",
    );
  }
  if (outcome.sqlstate === "42501") return;
  if (outcome.sqlstate === "42883" && retiredFunctionSignature !== undefined) {
    const identity = await fixture.runtimeSql(
      `SELECT to_regprocedure($1) IS NULL AS absent`,
      [retiredFunctionSignature],
    );
    if (identity.allowed && identity.result?.absent === true) return;
  }
  throw new Error(
    `Option C AFTER expected privilege denial, received ${outcome.sqlstate}.`,
  );
}

export async function runtimeBoolean(
  fixture: OptionCAfterFixture,
  sql: string,
  values: unknown[],
): Promise<boolean> {
  const result = await fixture.runtimeSql(sql, values);
  if (!result.allowed || typeof result.result?.allowed !== "boolean") {
    throw new Error(
      "Option C AFTER permission query did not return a boolean.",
    );
  }
  return result.result.allowed;
}
