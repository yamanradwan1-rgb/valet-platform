import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedMigrationDirectories } from "./migration-manifest.js";
const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migration = "20260919004500_mgt_fix_02_pagination_snapshot_membership";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `valet_mgt_fix02_upgrade_${suffix}`;
const freshDatabase = `valet_mgt_fix02_fresh_${suffix}`;
const runtimeRole = `valet_mgt_fix02_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
let upgrade: Client;
let fresh: Client;
let runtime: Client;
function scopedUrl(database: string, role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}
async function database(operation: "CREATE" | "DROP", name: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      operation === "CREATE"
        ? `CREATE DATABASE "${name}"`
        : `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
    );
  } finally {
    await client.end();
  }
}
async function apply(client: Client, name: string): Promise<void> {
  const sql = await readFile(new URL(`${name}/migration.sql`, migrationRoot), "utf8");
  await client.query(sql);
}
async function seedDependencies(client: Client, label: string) {
  const ids = {
    location: randomUUID(),
    membership: randomUUID(),
    organization: randomUUID(),
    user: randomUUID(),
    vehicle: randomUUID(),
  };
  await client.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,$2,'ACTIVE','Asia/Amman',clock_timestamp())`,
    [ids.organization, `MGT-FIX-02 ${label}`],
  );
  await client.query(
    `INSERT INTO locations(
       id,organization_id,name,code,address_text,timezone,currency,status,
       accepting_intake,updated_at)
     VALUES($1,$2,$3,$4,'Address','Asia/Amman','JOD','ACTIVE',TRUE,clock_timestamp())`,
    [ids.location, ids.organization, label, `F2-${ids.location}`],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [ids.user, `${ids.user}@mgt-fix-02.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships(
       id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [ids.membership, ids.organization, ids.user],
  );
  await client.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,clock_timestamp())`,
    [ids.vehicle, ids.organization, `Vehicle ${label}`],
  );
  return ids;
}
async function insertSessionAndAudit(
  client: Client,
  ids: Awaited<ReturnType<typeof seedDependencies>>,
) {
  const session = randomUUID();
  const audit = randomUUID();
  await client.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,organization_id,
       location_id,vehicle_id,state,checked_in_by_membership_id,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 day',$3,$4,$5,'PARKED',$6,clock_timestamp())`,
    [
      session,
      `mgt-fix-02-${session}`,
      ids.organization,
      ids.location,
      ids.vehicle,
      ids.membership,
    ],
  );
  await client.query(
    `INSERT INTO audit_events(
       id,organization_id,location_id,actor_type,event_type,entity_type,
       entity_id,metadata_json,occurred_at)
     VALUES($1,$2,$3,'SYSTEM','VALET_SESSION_CREATED','ValetSession',$4,'{}',clock_timestamp())`,
    [audit, ids.organization, ids.location, session],
  );
  return { audit, session };
}
function provisionRuntime(): void {
  execFileSync(process.execPath, ["scripts/provision-runtime-role.mjs"], {
    cwd: packageRoot,
    env: {
      ...process.env,
      DATABASE_URL: scopedUrl(freshDatabase, runtimeRole, runtimePassword),
      MIGRATION_DATABASE_URL: scopedUrl(freshDatabase),
      NODE_ENV: "test",
    },
    stdio: "pipe",
  });
}
function deployFresh(): void {
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: packageRoot,
    env: { ...process.env, MIGRATION_DATABASE_URL: scopedUrl(freshDatabase), NODE_ENV: "test" },
    stdio: "pipe",
  });
}
let legacy: Awaited<ReturnType<typeof insertSessionAndAudit>>;
beforeAll(async () => {
  await database("CREATE", upgradeDatabase);
  await database("CREATE", freshDatabase);
  upgrade = new Client({ connectionString: scopedUrl(upgradeDatabase) });
  await upgrade.connect();
  for (const name of expectedMigrationDirectories.slice(0, migrationIndex)) {
    await apply(upgrade, name);
  }
  legacy = await insertSessionAndAudit(
    upgrade,
    await seedDependencies(upgrade, "Upgrade"),
  );
  await apply(upgrade, migration);
  deployFresh();
  fresh = new Client({ connectionString: scopedUrl(freshDatabase) });
  await fresh.connect();
  provisionRuntime();
  runtime = new Client({
    connectionString: scopedUrl(freshDatabase, runtimeRole, runtimePassword),
  });
  await runtime.connect();
}, 120_000);
afterAll(async () => {
  await runtime?.end();
  await fresh?.end();
  await upgrade?.end();
  await database("DROP", upgradeDatabase);
  await database("DROP", freshDatabase);
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  } finally {
    await bootstrap.end();
  }
}, 60_000);
describe("MGT-FIX-02 migration 45 pagination snapshot membership", () => {
  it("is one forward migration and leaves legacy rows pre-snapshot", async () => {
    expect(migrationIndex).toBe(44);
    expect(expectedMigrationDirectories.at(-1)).toBe("20261015009300_outbound_post_result_phone_fence");
    expect(expectedMigrationDirectories.at(44)).toBe(migration);
    const rows = await upgrade.query<{ birth: string | null; source: string }>(
      `SELECT pagination_birth_xid::text AS birth,'audit' AS source
       FROM audit_events WHERE id=$1
       UNION ALL
       SELECT pagination_birth_xid::text,'session'
       FROM valet_sessions WHERE id=$2
       ORDER BY source`,
      [legacy.audit, legacy.session],
    );
    expect(rows.rows).toEqual([
      { birth: null, source: "audit" },
      { birth: null, source: "session" },
    ]);
  });
  it("uses xid8 markers without an index and preserves them on update", async () => {
    const columns = await fresh.query<{
      column_default: string | null;
      table_name: string;
      udt_name: string;
    }>(
      `SELECT table_name,column_default,udt_name
       FROM information_schema.columns
       WHERE table_schema='public' AND column_name='pagination_birth_xid'
       ORDER BY table_name`,
    );
    expect(columns.rows).toEqual([
      "audit_events", "dispatch_events", "incidents", "key_custody_events",
      "tasks", "valet_sessions",
    ].map((table_name) => ({
      column_default: "pg_current_xact_id()", table_name, udt_name: "xid8",
    })));
    expect(
      (
        await fresh.query(
          `SELECT indexname FROM pg_indexes
           WHERE schemaname='public' AND indexname LIKE '%pagination_birth%'`,
        )
      ).rows,
    ).toEqual([]);
    const ids = await seedDependencies(fresh, "Fresh");
    const rows = await insertSessionAndAudit(fresh, ids);
    const before = await fresh.query<{ birth: string }>(
      `SELECT pagination_birth_xid::text AS birth
       FROM valet_sessions WHERE id=$1`,
      [rows.session],
    );
    expect(before.rows[0]?.birth).toMatch(/^\d+$/);
    await fresh.query(
      `UPDATE valet_sessions
       SET pagination_birth_xid='1'::xid8 WHERE id=$1`,
      [rows.session],
    );
    const after = await fresh.query<{ birth: string }>(
      `SELECT pagination_birth_xid::text AS birth
       FROM valet_sessions WHERE id=$1`,
      [rows.session],
    );
    expect(after.rows[0]?.birth).toBe(before.rows[0]?.birth);
  });
  it("keeps runtime birth markers non-authoritative to callers", async () => {
    const privileges = await fresh.query<{
      audit_birth_insert: boolean;
      helper_execute: boolean;
    }>(
      `SELECT has_column_privilege(
                $1,'public.audit_events','pagination_birth_xid','INSERT'
              ) AS audit_birth_insert,
              has_function_privilege(
                $1,'public.management_pagination_preserve_birth_xid()','EXECUTE'
              ) AS helper_execute`,
      [runtimeRole],
    );
    expect(privileges.rows[0]).toEqual({
      audit_birth_insert: false,
      helper_execute: false,
    });
    const ids = await seedDependencies(fresh, "Runtime");
    const session = randomUUID();
    await runtime.query(
      `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,organization_id,
       location_id,vehicle_id,state,checked_in_by_membership_id,updated_at,
       pagination_birth_xid)
     VALUES($1,$2,clock_timestamp()+interval '1 day',$3,$4,$5,'PARKED',$6,
            clock_timestamp(),'1'::xid8)`,
      [
        session,
        `mgt-fix-02-runtime-${session}`,
        ids.organization,
        ids.location,
        ids.vehicle,
        ids.membership,
      ],
    );
    const before = await runtime.query<{ birth: string }>(
      `SELECT pagination_birth_xid::text AS birth
       FROM valet_sessions WHERE id=$1`,
      [session],
    );
    expect(before.rows[0]?.birth).not.toBe("1");
    await runtime.query(
      `UPDATE valet_sessions
       SET pagination_birth_xid='1'::xid8 WHERE id=$1`,
      [session],
    );
    const after = await runtime.query<{ birth: string }>(
      `SELECT pagination_birth_xid::text AS birth
       FROM valet_sessions WHERE id=$1`,
      [session],
    );
    expect(after.rows[0]?.birth).toBe(before.rows[0]?.birth);
  });
});
