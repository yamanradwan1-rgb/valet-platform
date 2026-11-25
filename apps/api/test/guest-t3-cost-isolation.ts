import { randomBytes, randomUUID } from "node:crypto";

import { Pool } from "pg";

import { createRuntimePostgresPool } from "../src/common/database/postgres";
import type { ShiftTestContext } from "./shift-test-context";
import { startProductionDatabaseSafetyContainer } from "./production-database-safety-container";
import {
  setupGuestT3Database,
  teardownGuestT3Database,
} from "./guest-t3-cost-database-setup";

export class GuestT3CostIsolation {
  readonly legacyRole = `vlt_t3_legacy_${process.pid.toString(36)}_${randomBytes(4).toString("hex")}`;
  private readonly legacyPassword = `legacy-${randomUUID()}`;
  private readonly originalTestUrl = process.env.TEST_DATABASE_URL;
  private readonly originalSqlProof =
    process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
  private migratorUrl = "";
  private container?: Awaited<
    ReturnType<typeof startProductionDatabaseSafetyContainer>
  >;
  private legacyRoleCreated = false;
  context!: ShiftTestContext;
  baselinePool!: Pool;

  async setup(): Promise<void> {
    this.container = await startProductionDatabaseSafetyContainer();
    const migratorPassword = `migrator-${randomUUID()}`;
    const managementPassword = randomBytes(32).toString("hex");
    const admin = new Pool({ connectionString: this.container.adminUrl });
    try {
      await admin.query(
        "CREATE ROLE vap1_proof_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      );
      await admin.query(
        "CREATE ROLE vaylet_staff_session_lock_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
      );
      await admin.query(
        `CREATE ROLE vaylet_management_writer LOGIN PASSWORD '${managementPassword}'
         NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await admin.query(
        `CREATE ROLE valet LOGIN PASSWORD '${migratorPassword}'
         NOINHERIT NOSUPERUSER CREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
      await admin.query(
        `GRANT vap1_proof_owner, vaylet_staff_session_lock_owner,
         vaylet_management_writer TO valet WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`,
      );
      await admin.query("CREATE DATABASE valet OWNER valet");
    } finally {
      await admin.end();
    }
    const migrationUrl = new URL(this.container.adminUrl);
    migrationUrl.username = "valet";
    migrationUrl.password = migratorPassword;
    migrationUrl.pathname = "/valet";
    this.migratorUrl = migrationUrl.toString();
    process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL =
      randomBytes(32).toString("base64url");
    // ShiftTestContext takes the bootstrap URL at module initialization.
    // Restore the primary harness URL immediately after this narrow import:
    // test ownership routing must never inherit the secondary as primary.
    process.env.TEST_DATABASE_URL = this.migratorUrl;
    let ShiftTestContextClass: typeof import("./shift-test-context").ShiftTestContext;
    try {
      ({ ShiftTestContext: ShiftTestContextClass } =
        await import("./shift-test-context"));
    } finally {
      if (this.originalTestUrl === undefined) {
        delete process.env.TEST_DATABASE_URL;
      } else {
        process.env.TEST_DATABASE_URL = this.originalTestUrl;
      }
    }
    this.context = new ShiftTestContextClass("t3_measured_cost");
    const managementUrl = new URL(this.context.migrationUrl);
    managementUrl.username = "vaylet_management_writer";
    managementUrl.password = managementPassword;
    const endpoint = new URL(this.container.adminUrl);
    for (const candidate of [
      this.migratorUrl,
      managementUrl.toString(),
      this.context.migrationUrl,
      this.context.runtimeUrl,
    ]) {
      const value = new URL(candidate);
      if (
        value.protocol !== endpoint.protocol ||
        value.hostname !== endpoint.hostname ||
        value.port !== endpoint.port
      ) {
        throw new Error(
          "T3 fixture PostgreSQL endpoint does not match its attested container.",
        );
      }
    }
    await setupGuestT3Database(this.context, this.migratorUrl, {
      ...this.container.childEnvironment,
      TEST_DATABASE_URL: this.migratorUrl,
      VAYLET_CI_POSTGRES_BOOTSTRAP_URL: this.migratorUrl,
      VAYLET_CI_MANAGEMENT_WRITER_PASSWORD: managementPassword,
      MANAGEMENT_WRITER_DATABASE_URL: managementUrl.toString(),
      ANTI_ABUSE_SQL_PROOF_SECRET_B64URL:
        process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL!,
    });
    await this.context.runtimePool.end();
    // T1's immutable SQL directly inserts/updates anti_abuse_events.
    // Grant compatibility DML to this role only in the disposable benchmark DB.
    await this.context.adminPool.query(
      `CREATE ROLE "${this.legacyRole}" WITH LOGIN PASSWORD '${this.legacyPassword}'
       NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT`,
    );
    this.legacyRoleCreated = true;
    await this.context.adminPool.query(
      `GRANT "${this.context.runtimeRole}" TO "${this.legacyRole}" WITH INHERIT TRUE, SET FALSE`,
    );
    await this.context.adminPool.query(
      `GRANT INSERT, UPDATE ON anti_abuse_events TO "${this.legacyRole}"`,
    );
    const url = new URL(this.context.runtimeUrl);
    url.username = this.legacyRole;
    url.password = this.legacyPassword;
    this.baselinePool = new Pool({ connectionString: url.toString(), max: 4 });
    this.context.runtimePool = this.baselinePool;
  }

  async teardown(): Promise<void> {
    try {
      await this.baselinePool?.end();
      if (this.context && this.legacyRoleCreated) {
        await this.context.adminPool.query(
          `REVOKE INSERT, UPDATE ON anti_abuse_events FROM "${this.legacyRole}"`,
        );
        await this.context.adminPool.query(
          `REVOKE "${this.context.runtimeRole}" FROM "${this.legacyRole}"`,
        );
        await this.context.adminPool.query(`DROP ROLE "${this.legacyRole}"`);
      }
    } finally {
      try {
        if (this.context) {
          if (
            !this.baselinePool ||
            this.context.runtimePool === this.baselinePool
          ) {
            this.context.runtimePool = createRuntimePostgresPool(
              this.context.runtimeUrl,
            );
          }
          await teardownGuestT3Database(this.context, this.migratorUrl);
        }
      } finally {
        try {
          await this.container?.stop();
        } finally {
          if (this.originalSqlProof === undefined) {
            delete process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL;
          } else {
            process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL =
              this.originalSqlProof;
          }
        }
      }
    }
  }
}
