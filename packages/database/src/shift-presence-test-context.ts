import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

import { Pool } from "pg";

export interface PresenceFixture {
  organizationId: string;
  locationId: string;
  userId: string;
  membershipId: string;
  shiftId: string;
}

function configuredTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL;
  if (value === undefined) throw new Error("Presence tests require an explicit local test database URL.");
  return value;
}
const baseUrl = configuredTestDatabaseUrl();
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));

export class PresenceTestContext {
  readonly databaseName = `vlt_presence_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  readonly runtimeRole = `vlt_presence_role_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  readonly runtimePassword = randomUUID();
  readonly migrationUrl: string;
  readonly runtimeUrl: string;
  admin!: Pool;
  runtime!: Pool;

  constructor() {
    const migration = new URL(baseUrl);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(migration.hostname)) {
      throw new Error("Presence tests require local disposable PostgreSQL.");
    }
    migration.pathname = `/${this.databaseName}`;
    this.migrationUrl = migration.toString();
    const runtime = new URL(migration);
    runtime.username = this.runtimeRole;
    runtime.password = this.runtimePassword;
    this.runtimeUrl = runtime.toString();
  }

  async setup(beforeForwardMigration?: () => Promise<void>) {
    const bootstrap = new Pool({ connectionString: baseUrl });
    try { await bootstrap.query(`CREATE DATABASE "${this.databaseName}"`); }
    finally { await bootstrap.end(); }
    this.admin = new Pool({ connectionString: this.migrationUrl });
    if (beforeForwardMigration !== undefined) {
      const staged = join(packageRoot, "tmp", this.databaseName);
      if (!resolve(staged).startsWith(resolve(packageRoot, "tmp") + sep)) {
        throw new Error("Disposable migration staging path escaped its task directory.");
      }
      const migrations = join(staged, "migrations");
      await mkdir(migrations, { recursive: true });
      try {
        for (const entry of await readdir(join(packageRoot, "prisma", "migrations"))) {
          if (entry.startsWith("20261004005800")) continue;
          await cp(join(packageRoot, "prisma", "migrations", entry), join(migrations, entry), { recursive: true });
        }
        const config = join(staged, "prisma.config.mjs");
        await writeFile(config, `export default { schema: '../../prisma/schema.prisma', migrations: {path:'./migrations'}, datasource: {url:process.env.MIGRATION_DATABASE_URL} };\n`);
        await this.script([prismaCli, "migrate", "deploy", "--config", config]);
        await beforeForwardMigration();
      } finally {
        await rm(staged, { recursive: true, force: true });
      }
    }
    await this.script([prismaCli, "migrate", "deploy"]);
    await this.script(["scripts/provision-runtime-role.mjs"]);
    this.runtime = new Pool({ connectionString: this.runtimeUrl });
  }

  async script(args: string[]) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: packageRoot, windowsHide: true,
        env: { ...process.env, NODE_ENV: "test", MIGRATION_DATABASE_URL: this.migrationUrl, DATABASE_URL: this.runtimeUrl },
        stdio: ["ignore", "pipe", "pipe"],
      });
      // Prisma failure output may include connection material: expose only the error category.
      let migrationFailed = false;
      child.stdout.on("data", (chunk: Buffer) => { migrationFailed ||= chunk.toString().includes("P3018"); });
      child.stderr.on("data", () => {});
      child.on("error", () => reject(new Error("Presence disposable database command could not start.")));
      child.on("close", (code) => code === 0 ? resolve() : reject(new Error(
        `Presence disposable database command failed (${String(code)}${migrationFailed ? ", P3018" : ""}).`,
      )));
    });
  }

  async teardown() {
    await this.runtime?.end();
    await this.admin?.end();
    const bootstrap = new Pool({ connectionString: baseUrl });
    try {
      await bootstrap.query(`DROP DATABASE IF EXISTS "${this.databaseName}" WITH (FORCE)`);
      await bootstrap.query(`DROP ROLE IF EXISTS "${this.runtimeRole}"`);
    } finally { await bootstrap.end(); }
  }

  async fixture(): Promise<PresenceFixture> {
    const f = { organizationId: randomUUID(), locationId: randomUUID(), userId: randomUUID(),
      membershipId: randomUUID(), shiftId: randomUUID() };
    await this.admin.query(`INSERT INTO organizations(id,name,timezone,updated_at) VALUES ($1,'Synthetic presence','Asia/Amman',now())`, [f.organizationId]);
    await this.admin.query(`INSERT INTO users(id,email,password_hash,status,updated_at) VALUES ($1,$2,'synthetic','ACTIVE',now())`, [f.userId, `${randomUUID()}@presence.test`]);
    await this.admin.query(`INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at) VALUES ($1,$2,'Synthetic','GATE','Synthetic','Asia/Amman','JOD',now())`, [f.locationId, f.organizationId]);
    await this.admin.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at) VALUES ($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',now())`, [f.membershipId, f.organizationId, f.userId]);
    await this.admin.query(`INSERT INTO shifts(id,organization_id,location_id,membership_id,status,started_at) VALUES ($1,$2,$3,$4,'ACTIVE',now())`, [f.shiftId, f.organizationId, f.locationId, f.membershipId]);
    return f;
  }
}
