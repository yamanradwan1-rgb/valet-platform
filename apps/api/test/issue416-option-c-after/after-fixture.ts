import { randomBytes, randomUUID } from "node:crypto";

import { runPnpm } from "../staff-auth-native-run-pnpm";
import { OptionCT5Fixture } from "../issue416-option-c-t5/probe-fixture";
import { assertOwnedOptionCAfterPg17 } from "../issue416-option-c-t5/owned-target";
import {
  ensureMigrationRole,
  ensureRuntimeRoleByOwner,
  grantMigrationDatabase,
  migrationBaseUrl,
} from "./after-migration-topology";

// AFTER tests use a second, named owner-only cluster. BEFORE .probe.ts suites
// retain their separate original target, opt-in switch and failing assertions.
export class OptionCAfterFixture extends OptionCT5Fixture {
  private readonly proofKey = randomBytes(32).toString("base64url");
  private readonly writerPasswords = [randomUUID(), randomUUID(), randomUUID()];
  private readonly priorProofKey = process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
  private readonly priorS02 = process.env.ISSUE416_S02_PROTECTED_TEST;
  private readonly priorMigrationBase = process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL;
  private readonly migrationPassword = randomUUID();

  constructor() {
    super(assertOwnedOptionCAfterPg17);
  }

  override async start(): Promise<void> {
    const ownerUrl = process.env.TEST_DATABASE_URL;
    if (!ownerUrl) throw new Error("W66 owner test URL is unavailable.");
    await ensureMigrationRole(ownerUrl, this.migrationPassword);
    process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL = migrationBaseUrl(
      ownerUrl,
      this.migrationPassword,
    );
    process.env.ISSUE416_S02_PROTECTED_TEST = "1";
    process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL = this.proofKey;
    try {
      await super.start();
    } catch (error) {
      this.restoreOptionCEnvironment();
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
        "vaylet_staff_auth_writer", this.writerPasswords[0]!,
      ),
      MFA_WRITER_DATABASE_URL: writer(
        "vaylet_mfa_writer", this.writerPasswords[1]!,
      ),
      MANAGEMENT_WRITER_DATABASE_URL: writer(
        "vaylet_management_writer", this.writerPasswords[2]!,
      ),
    };
  }

  protected override async prepareMigrationDatabase(databaseName: string) {
    const ownerUrl = process.env.TEST_DATABASE_URL;
    if (!ownerUrl) throw new Error("W66 owner test URL is unavailable.");
    await grantMigrationDatabase(ownerUrl, databaseName);
  }

  protected override async prepareRuntimeProvisioning(applicationUrl: string) {
    const ownerUrl = process.env.TEST_DATABASE_URL;
    if (!ownerUrl) throw new Error("W66 owner test URL is unavailable.");
    await ensureRuntimeRoleByOwner(ownerUrl, applicationUrl);
    await runPnpm(
      ["--filter", "@valet/database", "exec", "node", "scripts/provision-s04-proof-key.mjs"],
      {
        NODE_ENV: "test",
        DATABASE_URL: applicationUrl,
        MIGRATION_DATABASE_URL: this.migrationDatabaseUrl(),
        ANTI_ABUSE_SQL_PROOF_SECRET_B64URL: this.proofKey,
      },
    );
  }

  protected override async afterRuntimeProvisioning(
    applicationUrl: string,
    writers: Record<string, string>,
  ) {
    const environment = {
      NODE_ENV: "test",
      DATABASE_URL: applicationUrl,
      MIGRATION_DATABASE_URL: this.migrationDatabaseUrl(),
      ANTI_ABUSE_SQL_PROOF_SECRET_B64URL: this.proofKey,
      ...writers,
    };
    await runPnpm(["--filter", "@valet/database", "staff-auth-writer:provision"], environment);
    await runPnpm(
      ["--filter", "@valet/database", "exec", "node", "scripts/provision-option-c-protected-cutover.mjs"],
      { ...environment, OPTION_C_PROTECTED_CUTOVER: "1" },
    );
  }

  override async stop(): Promise<void> {
    try {
      await super.stop();
    } finally {
      this.restoreOptionCEnvironment();
    }
  }

  private restoreOptionCEnvironment() {
    if (this.priorProofKey === undefined) delete process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
    else process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL = this.priorProofKey;
    if (this.priorS02 === undefined) delete process.env.ISSUE416_S02_PROTECTED_TEST;
    else process.env.ISSUE416_S02_PROTECTED_TEST = this.priorS02;
    if (this.priorMigrationBase === undefined) {
      delete process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL;
    } else {
      process.env.STAFF_AUTH_TEST_MIGRATION_BASE_URL = this.priorMigrationBase;
    }
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
