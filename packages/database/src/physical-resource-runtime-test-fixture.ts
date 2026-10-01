import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { expect } from "vitest";
import { expectedMigrationDirectories } from "./migration-manifest.js";

interface PgError extends Error {
  code?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_mgt_232_role_${suffix}`;
export const runtimeRole = `valet_mgt_232_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
export let adminPool: Pool;
export let runtimePool: Pool;
let upgradeDirectory: string | undefined;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

export function runScript(args: string[], runtimeUrl?: string): void {
  execFileSync(process.execPath, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: scopedUrl(),
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });
}

export async function expectDenied(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as PgError).code).toBe("42501");
  }
}

interface Fixture {
  readonly adminMembershipId: string;
  readonly locationA: string;
  readonly locationB: string;
  readonly managerMembershipId: string;
  readonly organizationId: string;
  readonly zoneA: string;
  readonly zoneB: string;
}

export async function fixture(): Promise<Fixture> {
  const fixtureSuffix = randomUUID();
  const organizationId = randomUUID();
  const adminUserId = randomUUID();
  const managerUserId = randomUUID();
  const adminMembershipId = randomUUID();
  const managerMembershipId = randomUUID();
  const locationA = randomUUID();
  const locationB = randomUUID();
  const zoneA = randomUUID();
  const zoneB = randomUUID();
  await adminPool.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,'Issue 232 org','ACTIVE','Asia/Amman',clock_timestamp())`,
    [organizationId],
  );
  await adminPool.query(
    `INSERT INTO organization_subscriptions(
       organization_id,plan_code,status,dashboard_access_enabled,
       report_exports_enabled,basic_branding_enabled,updated_at)
     VALUES($1,'PRO','ACTIVE',TRUE,FALSE,FALSE,clock_timestamp())`,
    [organizationId],
  );
  for (const [userId, email] of [
    [adminUserId, `admin-${fixtureSuffix}@test.invalid`],
    [managerUserId, `manager-${fixtureSuffix}@test.invalid`],
  ]) {
    await adminPool.query(
      `INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
      [userId, email],
    );
  }
  await adminPool.query(
    `INSERT INTO organization_memberships(
       id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'ORG_ADMIN','ACTIVE',clock_timestamp()),
           ($4,$2,$5,'LOCATION_MANAGER','ACTIVE',clock_timestamp())`,
    [
      adminMembershipId,
      organizationId,
      adminUserId,
      managerMembershipId,
      managerUserId,
    ],
  );
  await adminPool.query(
    `INSERT INTO locations(
       id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
     VALUES($1,$3,'Location A','A','A','Asia/Amman','JOD','ACTIVE',clock_timestamp()),
           ($2,$3,'Location B','B','B','Asia/Amman','JOD','ACTIVE',clock_timestamp())`,
    [locationA, locationB, organizationId],
  );
  await adminPool.query(
    `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
     VALUES($1,$2,$3)`,
    [organizationId, managerMembershipId, locationA],
  );
  await adminPool.query(
    `INSERT INTO parking_zones(
       id,organization_id,location_id,code,label,status,updated_at)
     VALUES($1,$3,$4,'ZA','Zone A','ACTIVE',clock_timestamp()),
           ($2,$3,$5,'ZB','Zone B','ACTIVE',clock_timestamp())`,
    [zoneA, zoneB, organizationId, locationA, locationB],
  );
  return {
    adminMembershipId,
    locationA,
    locationB,
    managerMembershipId,
    organizationId,
    zoneA,
    zoneB,
  };
}

export async function startPhysicalResourceRuntime() {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  runScript([prismaCli, "migrate", "deploy"]);
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  adminPool = new Pool({ connectionString: scopedUrl() });
  runtimePool = new Pool({ connectionString: runtimeUrl });
}

export async function stopPhysicalResourceRuntime() {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
  if (upgradeDirectory !== undefined) {
    if (
      !resolve(upgradeDirectory).startsWith(resolve(packageRoot, "tmp") + sep)
    )
      throw new Error("Unsafe upgrade scratch path.");
    rmSync(upgradeDirectory, { recursive: true, force: true });
  }
}

export async function startPhysicalResourceUpgrade() {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await bootstrap.end();
  }
  adminPool = new Pool({ connectionString: scopedUrl() });
  mkdirSync(join(packageRoot, "tmp"), { recursive: true });
  upgradeDirectory = mkdtempSync(join(packageRoot, "tmp", "zone-upgrade-"));
  cpSync(
    join(packageRoot, "prisma/schema.prisma"),
    join(upgradeDirectory, "schema.prisma"),
  );
  mkdirSync(join(upgradeDirectory, "migrations"));
  cpSync(
    join(packageRoot, "prisma/migrations/migration_lock.toml"),
    join(upgradeDirectory, "migrations/migration_lock.toml"),
  );
  const upgradeIndex = expectedMigrationDirectories.indexOf(
    "20261001004800_mgt_236_parking_zone_creation",
  );
  for (const migration of expectedMigrationDirectories.slice(0, upgradeIndex)) {
    cpSync(
      join(packageRoot, "prisma/migrations", migration),
      join(upgradeDirectory, "migrations", migration),
      { recursive: true },
    );
  }
  const config = join(upgradeDirectory, "prisma.config.ts");
  writeFileSync(
    config,
    'import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: "schema.prisma", migrations: { path: "migrations" }, datasource: { url: process.env.MIGRATION_DATABASE_URL } });\n',
  );
  runScript([prismaCli, "migrate", "deploy", "--config", config]);
}

export async function finishPhysicalResourceUpgrade() {
  runScript([prismaCli, "migrate", "deploy"]);
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  runScript(["scripts/provision-runtime-role.mjs"], runtimeUrl);
  runtimePool = new Pool({ connectionString: runtimeUrl });
}
