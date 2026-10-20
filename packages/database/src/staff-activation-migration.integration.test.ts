import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedMigrationDirectories } from "./migration-manifest.js";
import { expectedCurrentMigrationDirectories } from "./issue304-migration-source-appendix.js";
import { installDec103NonemptyTestIndexes } from "./dec103-nonempty-test-rollout.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "node_modules/prisma/build/index.js");
const migration = "20261001005300_mgt_240d_staff_activation";
const previousAbuseEventId = randomUUID();
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = randomUUID().replaceAll("-", "");
const upgradeName = `valet_staff_activation_upgrade_${suffix}`;
const freshName = `valet_staff_activation_fresh_${suffix}`;
let upgrade: Pool;
let fresh: Client;
let scratch: string;
let snapshot: object[];
let commandDefinitions: { name: string; definition: string }[];
let invitationHistory: object[];
let auditHistory: object[];
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
  scratch = mkdtempSync(join(root, "tmp", "staff-activation-upgrade-"));
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
    n: 52,
    latest: "20261001005200_mgt_240c_invitation_anti_abuse_scope",
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
  await upgrade.query(
    "SELECT * FROM staff_onboarding_create($1,$2,$3,$4,$5,'New','Pending','VALET_EMPLOYEE',$6::uuid[],$7)",
    [
      (
        await upgrade.query(
          "SELECT id FROM organization_memberships WHERE user_id=$1",
          [ids.admin],
        )
      ).rows[0].id,
      ids.org,
      randomUUID(),
      "c".repeat(64),
      `${randomUUID()}@pending.test`,
      [ids.location],
      `staff-invite-sha256:v1:${"d".repeat(64)}`,
    ],
  );
  snapshot = (await upgrade.query(snapshotSql)).rows;
  invitationHistory = (
    await upgrade.query(
      "SELECT * FROM staff_onboarding_invitations ORDER BY id",
    )
  ).rows;
  auditHistory = (await upgrade.query("SELECT * FROM audit_events ORDER BY id"))
    .rows;
  commandDefinitions = (
    await upgrade.query<{ name: string; definition: string }>(
      "SELECT proname AS name,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('staff_management_authorize_staff_actor','staff_management_lock_lm_active_grants','staff_management_lm_target_covered') ORDER BY proname",
    )
  ).rows;
  await upgrade.query(
    `INSERT INTO anti_abuse_events(id,scope,key_hash,state)
     VALUES($1,'v1:staff-login-identifier',$2,'COUNTED')`,
    [previousAbuseEventId, `anti-abuse-hmac-sha256:v1:${"a".repeat(64)}`],
  );
  await installDec103NonemptyTestIndexes(upgrade);
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
describe("T05-D actual Prisma 052 to 053 and fresh deployment", () => {
  it("preserves User credentials/state, T05-A membership names/state and grants without backfill", async () => {
    expect((await upgrade.query(snapshotSql)).rows).toEqual(snapshot);
    expect(
      (
        await upgrade.query(
          "SELECT * FROM staff_onboarding_invitations ORDER BY id",
        )
      ).rows,
    ).toEqual(invitationHistory);
    expect(
      (await upgrade.query("SELECT * FROM audit_events ORDER BY id")).rows,
    ).toEqual(auditHistory);
    expect(
      (
        await upgrade.query(
          "SELECT proname AS name,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('staff_management_authorize_staff_actor','staff_management_lock_lm_active_grants','staff_management_lm_target_covered') ORDER BY proname",
        )
      ).rows,
    ).toEqual(commandDefinitions);
  });
  it("records exactly 53 versioned migrations in both paths, PENDING enums and nullable password", async () => {
    for (const connection of [upgrade, fresh]) {
      expect(
        (
          await connection.query(
            "SELECT count(*)::int AS n,max(migration_name) AS latest FROM _prisma_migrations WHERE finished_at IS NOT NULL",
          )
        ).rows[0],
      ).toEqual({
        n: expectedCurrentMigrationDirectories.length,
        latest: expectedCurrentMigrationDirectories.at(-1),
      });
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
  it("preserves existing anti-abuse events while accepting only approved issuance scopes", async () => {
    expect(
      (
        await upgrade.query(
          "SELECT scope,state FROM anti_abuse_events WHERE id=$1",
          [previousAbuseEventId],
        )
      ).rows[0],
    ).toEqual({ scope: "v1:staff-login-identifier", state: "COUNTED" });
    await upgrade.query(
      `INSERT INTO anti_abuse_events(scope,key_hash,state)
       VALUES('v1:staff-onboarding-create-organization',$1,'COUNTED')`,
      [`anti-abuse-hmac-sha256:v1:${"b".repeat(64)}`],
    );
    for (const scope of [
      "v1:staff-activation-credential",
      "v1:staff-activation-client-address",
    ]) {
      await upgrade.query(
        "INSERT INTO anti_abuse_events(scope,key_hash,state) VALUES($1,$2,'COUNTED')",
        [scope, `anti-abuse-hmac-sha256:v1:${"e".repeat(64)}`],
      );
    }
    for (const connection of [upgrade, fresh]) {
      const acl = await connection.query(
        "SELECT prosecdef, proconfig=ARRAY['search_path=pg_catalog, public']::text[] AS safe_path, NOT EXISTS(SELECT 1 FROM aclexplode(proacl) WHERE grantee=0 AND privilege_type='EXECUTE') AS private FROM pg_proc WHERE oid='staff_onboarding_activate(text,text,text)'::regprocedure",
      );
      expect(acl.rows[0]).toEqual({
        prosecdef: true,
        safe_path: true,
        private: true,
      });
    }
  });
});
