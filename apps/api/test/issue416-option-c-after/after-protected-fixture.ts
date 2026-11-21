import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Pool } from "pg";

import { assertOwnedOptionCAfterPg17 } from "../issue416-option-c-t5/owned-target";
import { OptionCAfterOnboardingFixture } from "./after-onboarding-fixture";

const knownWriterContracts = [
  "packages/database/scripts/staff-auth-writer-provisioning-policy.mjs",
  "packages/database/scripts/mfa-protected-writer-privileges.mjs",
  "packages/database/scripts/management-writer-privileges.mjs",
] as const;

type WriterKey =
  | "STAFF_AUTH_WRITER_DATABASE_URL"
  | "MFA_WRITER_DATABASE_URL"
  | "MANAGEMENT_WRITER_DATABASE_URL";

export class OptionCAfterProtectedFixture extends OptionCAfterOnboardingFixture {
  private readonly passwords = [randomUUID(), randomUUID(), randomUUID()];
  private readonly mfaRole = "vaylet_mfa_writer";
  private writerUrls: Partial<Record<WriterKey, string>> = {};

  override async start(): Promise<void> {
    await assertOwnedOptionCAfterPg17();
    for (const path of knownWriterContracts) {
      if (!existsSync(resolve(process.cwd(), "../..", path))) {
        throw new Error(`Option C protected writer source is not integrated: ${path}`);
      }
    }
    await super.start();
    await this.assertIndependentWriterConnections();
  }

  protected override protectedWriterTestEnvironment(applicationUrl: string) {
    const url = (role: string, password: string): string => {
      const result = new URL(applicationUrl);
      result.username = role;
      result.password = password;
      return result.toString();
    };
    this.writerUrls = {
      STAFF_AUTH_WRITER_DATABASE_URL: url("vaylet_staff_auth_writer", this.passwords[0]!),
      MFA_WRITER_DATABASE_URL: url(this.mfaRole, this.passwords[1]!),
      MANAGEMENT_WRITER_DATABASE_URL: url("vaylet_management_writer", this.passwords[2]!),
    };
    return {
      STAFF_AUTH_WRITER_DATABASE_URL:
        this.writerUrls.STAFF_AUTH_WRITER_DATABASE_URL!,
      MFA_WRITER_DATABASE_URL: this.writerUrls.MFA_WRITER_DATABASE_URL!,
      MANAGEMENT_WRITER_DATABASE_URL:
        this.writerUrls.MANAGEMENT_WRITER_DATABASE_URL!,
      MFA_PROTECTED_WRITER_ENABLED: "true",
    };
  }

  writerUrl(key: WriterKey): string {
    const value = this.writerUrls[key];
    if (value === undefined) throw new Error(`Option C writer URL unavailable: ${key}`);
    if (value === this.runtimeDatabaseUrl() || value === this.migrationDatabaseUrl()) {
      throw new Error("Option C protected writer fallback to runtime/admin forbidden.");
    }
    return value;
  }

  async assertIndependentWriterConnections() {
    const admin = new URL(this.migrationDatabaseUrl());
    const runtime = new URL(this.runtimeDatabaseUrl());
    const roles = [
      ["STAFF_AUTH_WRITER_DATABASE_URL", "vaylet_staff_auth_writer"],
      ["MFA_WRITER_DATABASE_URL", this.mfaRole],
      ["MANAGEMENT_WRITER_DATABASE_URL", "vaylet_management_writer"],
    ] as const;
    const passwords = new Set([admin.password, runtime.password]);
    for (const [key, role] of roles) {
      const text = this.writerUrl(key);
      const writerUrl = new URL(text);
      if (
        writerUrl.hostname !== runtime.hostname ||
        writerUrl.port !== runtime.port ||
        writerUrl.pathname !== runtime.pathname ||
        writerUrl.username !== role ||
        !writerUrl.password || passwords.has(writerUrl.password) ||
        writerUrl.search || writerUrl.hash
      ) throw new Error(`W37 protected writer URL mismatch: ${key}`);
      passwords.add(writerUrl.password);
      const pool = new Pool({ connectionString: text, max: 1 });
      try {
        const observed = await pool.query<{
          principal: string; database: string;
          superuser: boolean; createdb: boolean; createrole: boolean;
          replication: boolean; bypassrls: boolean; inherit: boolean;
          parent_count: string;
        }>(`SELECT current_user AS principal,current_database() AS database,
                 role.rolsuper AS superuser,role.rolcreatedb AS createdb,
                 role.rolcreaterole AS createrole,role.rolreplication AS replication,
                 role.rolbypassrls AS bypassrls,role.rolinherit AS inherit,
                 (SELECT count(*)::text FROM pg_auth_members AS member
                  WHERE member.member=role.oid) AS parent_count
          FROM pg_roles AS role WHERE role.rolname=current_user`);
        const found = observed.rows[0];
        if (
          observed.rowCount !== 1 || found?.principal !== role ||
          found.database !== runtime.pathname.slice(1) ||
          found.superuser || found.createdb || found.createrole ||
          found.replication || found.bypassrls || found.inherit ||
          found.parent_count !== "0"
        ) throw new Error(`W37 protected writer principal unsafe: ${key}`);
      } finally {
        await pool.end();
      }
    }
  }

  async managementWriterSql(sql: string, values: unknown[] = []) {
    const pool = new Pool({
      connectionString: this.writerUrl("MANAGEMENT_WRITER_DATABASE_URL"), max: 1,
    });
    try {
      const principal = await pool.query(`SELECT current_user AS role`);
      if (principal.rows[0]?.role !== "vaylet_management_writer") {
        throw new Error("W37 management writer SQL principal mismatch.");
      }
      try {
        const result = await pool.query<Record<string, unknown>>(sql, values);
        return { allowed: true as const, result: result.rows[0] };
      } catch (error) {
        const sqlstate = (error as { code?: unknown }).code;
        if (sqlstate !== "42501" && sqlstate !== "42883") throw error;
        return { allowed: false as const, sqlstate };
      }
    } finally {
      await pool.end();
    }
  }
}
