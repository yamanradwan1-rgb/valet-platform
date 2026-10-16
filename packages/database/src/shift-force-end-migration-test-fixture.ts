import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { expectedMigrationDirectories } from "./migration-manifest.js";
import {
  provisionShiftForceEndPrivileges,
  verifyShiftForceEndPrivileges,
} from "../scripts/shift-force-end-runtime-privileges.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
export const forceEndMigration = "20261002005400_mgt_240f_force_end_shift";

export class ShiftForceEndMigrationTestFixture {
  readonly suffix = randomUUID().replaceAll("-", "");
  readonly upgradeName = `vlt_240f_upgrade_${this.suffix}`;
  readonly freshName = `vlt_240f_fresh_${this.suffix}`;
  readonly runtimeRole = `vlt_240f_runtime_${this.suffix}`;
  readonly runtimePassword = randomUUID();
  readonly org = randomUUID();
  readonly actor = randomUUID();
  readonly shift = randomUUID();
  upgrade!: Pool;
  freshEvidence!: { migrations: object; closureCount: number };
  preMigrationCount = 0;
  runtime!: Pool;
  before!: object[];
  functions!: object[];
  scratch = "";

  url(name: string, runtime = false) {
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    if (runtime) {
      url.username = this.runtimeRole;
      url.password = this.runtimePassword;
    }
    return url.toString();
  }

  snapshotSql = `SELECT s.*,m.role,m.status AS member_status,m.first_name,m.last_name,
    u.email,u.password_hash,u.status AS user_status FROM shifts s
    JOIN organization_memberships m ON m.id=s.membership_id AND m.organization_id=s.organization_id
    JOIN users u ON u.id=m.user_id ORDER BY s.id`;
  functionsSql = `SELECT proname,pg_get_functiondef(oid) AS definition FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND prokind='f' ORDER BY proname,oid`;

  deploy(name: string, config?: string) {
    execFileSync(
      process.execPath,
      [
        join(root, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        ...(config ? ["--config", config] : []),
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          NODE_ENV: "test",
          MIGRATION_DATABASE_URL: this.url(name),
        },
        stdio: "pipe",
        windowsHide: true,
      },
    );
  }

  async provision() {
    // Migration 054 predates the current privilege surface. Exercise its
    // versioned grant helper against the historical disposable fixture.
    const client = await this.upgrade.connect();
    try {
      const existing = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname=$1", [this.runtimeRole],
      );
      if (existing.rowCount === 0)
        await client.query(
          `CREATE ROLE "${this.runtimeRole}" LOGIN PASSWORD '${this.runtimePassword}'
           NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
        );
      await client.query(`GRANT CONNECT ON DATABASE "${this.upgradeName}" TO "${this.runtimeRole}"`);
      await client.query(`GRANT USAGE ON SCHEMA public TO "${this.runtimeRole}"`);
      const formatted = async (format: string, values: readonly string[]) => {
        const placeholders = values.map((_, index) => `$${index + 2}::text`).join(",");
        const result = await client.query(
          `SELECT format($1,${placeholders}) AS statement`, [format, ...values],
        );
        await client.query(result.rows[0].statement);
      };
      await provisionShiftForceEndPrivileges(
        client, (_ignored: unknown, format: string, values: readonly string[]) => formatted(format, values),
        this.runtimeRole,
      );
      await verifyShiftForceEndPrivileges(client, this.runtimeRole);
    } finally {
      client.release();
    }
  }

  async start() {
    const bootstrap = new Client({ connectionString: adminUrl });
    await bootstrap.connect();
    try {
      await bootstrap.query(`CREATE DATABASE "${this.upgradeName}"`);
      await bootstrap.query(`CREATE DATABASE "${this.freshName}"`);
    } finally {
      await bootstrap.end();
    }
    mkdirSync(join(root, "tmp"), { recursive: true });
    this.scratch = mkdtempSync(join(root, "tmp", "force-end-upgrade-"));
    cpSync(
      join(root, "prisma/schema.prisma"),
      join(this.scratch, "schema.prisma"),
    );
    mkdirSync(join(this.scratch, "migrations"));
    cpSync(
      join(root, "prisma/migrations/migration_lock.toml"),
      join(this.scratch, "migrations/migration_lock.toml"),
    );
    for (const name of expectedMigrationDirectories.slice(
      0,
      expectedMigrationDirectories.indexOf(forceEndMigration),
    ))
      cpSync(
        join(root, "prisma/migrations", name),
        join(this.scratch, "migrations", name),
        { recursive: true },
      );
    const config = join(this.scratch, "prisma.config.ts");
    writeFileSync(
      config,
      'import { defineConfig } from "prisma/config";\nexport default defineConfig({schema:"schema.prisma",migrations:{path:"migrations"},datasource:{url:process.env.MIGRATION_DATABASE_URL}});\n',
    );
    this.deploy(this.upgradeName, config);
    this.upgrade = new Pool({ connectionString: this.url(this.upgradeName) });
    this.preMigrationCount = (
      await this.upgrade.query(
        "SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL",
      )
    ).rows[0].n;
    const user = randomUUID(),
      location = randomUUID();
    await this.upgrade.query(
      "INSERT INTO organizations(id,name,timezone,updated_at) VALUES($1,'Preserved','Asia/Amman',now())",
      [this.org],
    );
    await this.upgrade.query(
      "INSERT INTO users(id,email,password_hash,updated_at) VALUES($1,$2,'preserved-verifier',now())",
      [user, `${user}@example.test`],
    );
    await this.upgrade.query(
      "INSERT INTO organization_memberships(id,organization_id,user_id,role,first_name,last_name,updated_at) VALUES($1,$2,$3,'VALET_EMPLOYEE','اسم','محفوظ',now())",
      [this.actor, this.org, user],
    );
    await this.upgrade.query(
      "INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at) VALUES($1,$2,'Preserved','P','Address','Asia/Amman','JOD',now())",
      [location, this.org],
    );
    await this.upgrade.query(
      `INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at,ended_at,
      cash_expected,cash_reported,cash_variance,cash_currency,cash_reported_at,cash_reported_by_membership_id)
      VALUES($1,$2,$3,$4,'ENDED',now()-interval '1 hour',now(),1,2,1,'JOD',now(),$4)`,
      [this.shift, this.org, location, this.actor],
    );
    await this.upgrade.query(
      "INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at) VALUES($1,$2,$3,$4,'ACTIVE',now())",
      [randomUUID(), this.org, location, this.actor],
    );
    this.before = (await this.upgrade.query(this.snapshotSql)).rows;
    this.functions = (await this.upgrade.query(this.functionsSql)).rows;
    // This historical proof must stay at 054 when later migrations exist.
    cpSync(
      join(root, "prisma/migrations", forceEndMigration),
      join(this.scratch, "migrations", forceEndMigration),
      { recursive: true },
    );
    this.deploy(this.upgradeName, config);
    this.deploy(this.freshName, config);
    const fresh = new Pool({ connectionString: this.url(this.freshName) });
    try {
      this.freshEvidence = {
        migrations: (
          await fresh.query(
            "SELECT count(*)::int AS n,max(migration_name) AS latest FROM _prisma_migrations WHERE finished_at IS NOT NULL",
          )
        ).rows[0],
        closureCount: (
          await fresh.query(
            "SELECT count(*)::int AS n FROM shift_force_end_closures",
          )
        ).rows[0].n,
      };
    } finally {
      await fresh.end();
    }
    await this.provision();
    await this.provision();
    this.runtime = new Pool({
      connectionString: this.url(this.upgradeName, true),
    });
  }

  async stop() {
    await this.runtime?.end();
    await this.upgrade?.end();
    const bootstrap = new Client({ connectionString: adminUrl });
    await bootstrap.connect();
    try {
      await bootstrap.query(
        `DROP DATABASE IF EXISTS "${this.upgradeName}" WITH(FORCE)`,
      );
      await bootstrap.query(
        `DROP DATABASE IF EXISTS "${this.freshName}" WITH(FORCE)`,
      );
      await bootstrap.query(`DROP ROLE IF EXISTS "${this.runtimeRole}"`);
    } finally {
      await bootstrap.end();
    }
    if (
      this.scratch &&
      resolve(this.scratch).startsWith(resolve(root, "tmp") + sep)
    )
      rmSync(this.scratch, { recursive: true, force: true });
  }
}
