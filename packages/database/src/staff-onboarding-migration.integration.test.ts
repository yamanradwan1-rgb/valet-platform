import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedMigrationDirectories } from "./migration-manifest.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "node_modules/prisma/build/index.js");
const migration = "20261001005100_mgt_240c_staff_onboarding_invites";
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = randomUUID().replaceAll("-", "");
const upgradeName = `valet_staff_onboarding_upgrade_${suffix}`;
const freshName = `valet_staff_onboarding_fresh_${suffix}`;
let upgrade: Pool;
let fresh: Client;
let scratch: string;
let snapshot: object[];
let commandDefinitions: { name: string; definition: string }[];
const ids = {
  org: randomUUID(),
  admin: randomUUID(),
  user: randomUUID(),
  member: randomUUID(),
  location: randomUUID(),
};
const snapshotSql = `SELECT m.id,m.organization_id,m.user_id,m.role,m.status,m.version,
 m.first_name,m.last_name,m.created_at,m.updated_at,u.email,u.password_hash,u.status AS user_status,a.location_id
 FROM organization_memberships m JOIN users u ON u.id=m.user_id
 LEFT JOIN membership_location_access a ON a.membership_id=m.id AND a.organization_id=m.organization_id ORDER BY m.id`;
function url(name: string) {
  const value = new URL(adminUrl);
  value.pathname = `/${name}`;
  return value.toString();
}
function deploy(name: string, config?: string) {
  execFileSync(
    process.execPath,
    [cli, "migrate", "deploy", ...(config ? ["--config", config] : [])],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        MIGRATION_DATABASE_URL: url(name),
      },
      stdio: "pipe",
      windowsHide: true,
    },
  );
}
beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${upgradeName}"`);
    await bootstrap.query(`CREATE DATABASE "${freshName}"`);
  } finally {
    await bootstrap.end();
  }
  mkdirSync(join(root, "tmp"), { recursive: true });
  scratch = mkdtempSync(join(root, "tmp", "staff-onboarding-upgrade-"));
  cpSync(join(root, "prisma/schema.prisma"), join(scratch, "schema.prisma"));
  mkdirSync(join(scratch, "migrations"));
  cpSync(
    join(root, "prisma/migrations/migration_lock.toml"),
    join(scratch, "migrations/migration_lock.toml"),
  );
  for (const name of expectedMigrationDirectories.slice(
    0,
    expectedMigrationDirectories.indexOf(migration),
  ))
    cpSync(
      join(root, "prisma/migrations", name),
      join(scratch, "migrations", name),
      { recursive: true },
    );
  const config = join(scratch, "prisma.config.ts");
  writeFileSync(
    config,
    'import { defineConfig } from "prisma/config";\nexport default defineConfig({schema:"schema.prisma",migrations:{path:"migrations"},datasource:{url:process.env.MIGRATION_DATABASE_URL}});\n',
  );
  deploy(upgradeName, config);
  upgrade = new Pool({ connectionString: url(upgradeName) });
  const before = await upgrade.query(
    "SELECT count(*)::int AS n,max(migration_name) AS latest FROM _prisma_migrations WHERE finished_at IS NOT NULL",
  );
  expect(before.rows[0]).toEqual({
    n: 50,
    latest: "20261001005000_mgt_240b_lm_staff_authority",
  });
  await upgrade.query(
    "INSERT INTO organizations(id,name,timezone,updated_at) VALUES($1,'Preserved','Asia/Amman',now())",
    [ids.org],
  );
  await upgrade.query(
    "INSERT INTO organization_subscriptions(organization_id,plan_code,status,dashboard_access_enabled,report_exports_enabled,basic_branding_enabled) VALUES($1,'TEST_ENTITLED','ACTIVE',TRUE,TRUE,TRUE)",
    [ids.org],
  );
  for (const [userId, status, role, memberStatus] of [
    [ids.admin, "ACTIVE", "ORG_ADMIN", "ACTIVE"],
    [ids.user, "DISABLED", "VALET_EMPLOYEE", "INACTIVE"],
  ]) {
    const memberId = userId === ids.admin ? randomUUID() : ids.member;
    await upgrade.query(
      "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'preserved-real-verifier',$3,now())",
      [userId, `${userId}@preserve.test`, status],
    );
    await upgrade.query(
      "INSERT INTO organization_memberships(id,organization_id,user_id,first_name,last_name,role,status,version,updated_at) VALUES($1,$2,$3,'ليلى','Preserved',$4,$5,7,now())",
      [memberId, ids.org, userId, role, memberStatus],
    );
  }
  await upgrade.query(
    "INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at) VALUES($1,$2,'Preserved','P','Address','Asia/Amman','JOD',now())",
    [ids.location, ids.org],
  );
  await upgrade.query(
    "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
    [ids.org, ids.member, ids.location],
  );
  snapshot = (await upgrade.query(snapshotSql)).rows;
  commandDefinitions = (
    await upgrade.query<{ name: string; definition: string }>(
      "SELECT proname AS name,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('staff_management_authorize_staff_actor','staff_management_lock_lm_active_grants','staff_management_lm_target_covered') ORDER BY proname",
    )
  ).rows;
  deploy(upgradeName);
  deploy(freshName);
  fresh = new Client({ connectionString: url(freshName) });
  await fresh.connect();
}, 120_000);
afterAll(async () => {
  await upgrade?.end();
  await fresh?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(
      `DROP DATABASE IF EXISTS "${upgradeName}" WITH(FORCE)`,
    );
    await bootstrap.query(`DROP DATABASE IF EXISTS "${freshName}" WITH(FORCE)`);
  } finally {
    await bootstrap.end();
  }
  if (scratch && resolve(scratch).startsWith(resolve(root, "tmp") + sep))
    rmSync(scratch, { recursive: true, force: true });
}, 60_000);
describe("T05-C actual Prisma 050 to 051 and fresh deployment", () => {
  it("preserves User credentials/state, T05-A membership names/state and grants without backfill", async () => {
    expect((await upgrade.query(snapshotSql)).rows).toEqual(snapshot);
    expect(
      (await upgrade.query("SELECT 1 FROM staff_onboarding_invitations"))
        .rowCount,
    ).toBe(0);
    expect(
      (
        await upgrade.query(
          "SELECT proname AS name,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('staff_management_authorize_staff_actor','staff_management_lock_lm_active_grants','staff_management_lm_target_covered') ORDER BY proname",
        )
      ).rows,
    ).toEqual(commandDefinitions);
  });
  it("records exactly 51 versioned migrations in both paths, PENDING enums and nullable password", async () => {
    for (const connection of [upgrade, fresh]) {
      expect(
        (
          await connection.query(
            "SELECT count(*)::int AS n,max(migration_name) AS latest FROM _prisma_migrations WHERE finished_at IS NOT NULL",
          )
        ).rows[0],
      ).toEqual({ n: 51, latest: migration });
      expect(
        (
          await connection.query(
            "SELECT is_nullable FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash'",
          )
        ).rows[0]?.is_nullable,
      ).toBe("YES");
      expect(
        (
          await connection.query(
            "SELECT 'PENDING'::user_status AS account,'PENDING'::membership_status AS member",
          )
        ).rows[0],
      ).toEqual({ account: "PENDING", member: "PENDING" });
    }
  });
});
