import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl = process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const migration = "20260918004400_mgt_be_11_all_locations_reports";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `valet_mgt_be11_upgrade_${suffix}`;
const freshDatabase = `valet_mgt_be11_fresh_${suffix}`;
const dispatchIndex = "dispatch_events_org_location_occurred_at_company_reports_idx";
let upgrade: Client;
let fresh: Client;
let beforeRelations: Array<{ relkind: string; relname: string }> = [];
let beforeRoutines: Array<{ prokind: string; proname: string }> = [];

function scopedUrl(database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function apply(client: Client, name: string): Promise<void> {
  const sql = await readFile(new URL(`${name}/migration.sql`, migrationRoot), "utf8");
  await client.query(sql);
}

async function createDatabase(database: string): Promise<void> {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try { await bootstrap.query(`CREATE DATABASE "${database}"`); }
  finally { await bootstrap.end(); }
}

async function dropDatabase(database: string): Promise<void> {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try { await bootstrap.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); }
  finally { await bootstrap.end(); }
}

function tokenHash(raw: string): string {
  return `sha256:v1:${createHash("sha256").update(raw).digest("hex")}`;
}

async function seedSourceRows(client: Client) {
  const ids = {
    dispatch: randomUUID(), incident: randomUUID(), location: randomUUID(),
    membership: randomUUID(), organization: randomUUID(), session: randomUUID(),
    task: randomUUID(), user: randomUUID(), vehicle: randomUUID(),
  };
  await client.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,'BE11 Upgrade','ACTIVE','Asia/Amman',clock_timestamp())`,
    [ids.organization],
  );
  await client.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES($1,$2,'BE11 Location','BE11','Address','Asia/Amman','JOD',clock_timestamp())`,
    [ids.location, ids.organization],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [ids.user, `${ids.user}@be11.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [ids.membership, ids.organization, ids.user],
  );
  await client.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,'BE11 Vehicle',clock_timestamp())`,
    [ids.vehicle, ids.organization],
  );
  await client.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,organization_id,
       location_id,vehicle_id,state,checked_in_by_membership_id,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'PARKED',$6,clock_timestamp())`,
    [ids.session, tokenHash(`be11-${ids.session}`), ids.organization,
      ids.location, ids.vehicle, ids.membership],
  );
  await client.query(
    `INSERT INTO tasks(id,organization_id,location_id,valet_session_id,task_type,status,updated_at)
     VALUES($1,$2,$3,$4,'RETRIEVAL','QUEUED',clock_timestamp())`,
    [ids.task, ids.organization, ids.location, ids.session],
  );
  await client.query(
    `INSERT INTO dispatch_events(
       id,organization_id,location_id,task_id,valet_session_id,event_type,occurred_at)
     VALUES($1,$2,$3,$4,$5,'QUEUED','2026-09-18T00:00:00Z')`,
    [ids.dispatch, ids.organization, ids.location, ids.task, ids.session],
  );
  await client.query(
    `INSERT INTO incidents(
       id,organization_id,location_id,valet_session_id,status,severity,type,description,
       reported_by_membership_id,created_at)
     VALUES($1,$2,$3,$4,'OPEN','HIGH','KEY_MISSING','Benchmark-backed migration row',$5,
            '2026-09-18T00:00:00Z')`,
    [ids.incident, ids.organization, ids.location, ids.session, ids.membership],
  );
  return ids;
}

async function publicRelations(client: Client) {
  return (await client.query<{ relkind: string; relname: string }>(
    `SELECT c.relname,c.relkind FROM pg_class c
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' ORDER BY c.relname,c.relkind`,
  )).rows;
}

async function publicRoutines(client: Client) {
  return (await client.query<{ prokind: string; proname: string }>(
    `SELECT p.proname,p.prokind FROM pg_proc p
     JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' ORDER BY p.proname,p.prokind`,
  )).rows;
}

let seeded: Awaited<ReturnType<typeof seedSourceRows>>;

beforeAll(async () => {
  await createDatabase(upgradeDatabase);
  await createDatabase(freshDatabase);
  upgrade = new Client({ connectionString: scopedUrl(upgradeDatabase) });
  await upgrade.connect();
  for (const name of expectedMigrationDirectories.slice(0, migrationIndex)) {
    await apply(upgrade, name);
  }
  seeded = await seedSourceRows(upgrade);
  beforeRelations = await publicRelations(upgrade);
  beforeRoutines = await publicRoutines(upgrade);
  await apply(upgrade, migration);

  fresh = new Client({ connectionString: scopedUrl(freshDatabase) });
  await fresh.connect();
  for (const name of expectedMigrationDirectories) await apply(fresh, name);
}, 120_000);

afterAll(async () => {
  await upgrade?.end();
  await fresh?.end();
  await dropDatabase(upgradeDatabase);
  await dropDatabase(freshDatabase);
}, 60_000);

describe("MGT-BE-11 migration 44 company analytics/report indexes", () => {
  it("is exactly migration 44 and preserves upgraded source rows", async () => {
    expect(migrationIndex).toBe(43);
    expect(expectedMigrationDirectories).toHaveLength(45);
    expect(expectedMigrationDirectories.at(43)).toBe(migration);
    expect((await upgrade.query(
      `SELECT id::text AS id,event_type::text AS event_type FROM dispatch_events WHERE id=$1`,
      [seeded.dispatch],
    )).rows[0]).toEqual({ event_type: "QUEUED", id: seeded.dispatch });
    expect((await upgrade.query(
      `SELECT id::text AS id,severity::text AS severity,type FROM incidents WHERE id=$1`,
      [seeded.incident],
    )).rows[0]).toEqual({ id: seeded.incident, severity: "HIGH", type: "KEY_MISSING" });
  });

  it("creates only the measured Dispatch index on fresh and upgrade paths", async () => {
    const definitions = await fresh.query<{ indexdef: string; indexname: string }>(
      `SELECT indexname,indexdef FROM pg_indexes
       WHERE schemaname='public' AND indexname=$1`,
      [dispatchIndex],
    );
    expect(definitions.rows).toHaveLength(1);
    expect(definitions.rows.find((row) => row.indexname === dispatchIndex)?.indexdef)
      .toContain("(organization_id, location_id, occurred_at) INCLUDE (task_id, event_type)");

    const afterRelations = await publicRelations(upgrade);
    const beforeNames = new Set(beforeRelations.map((row) => `${row.relkind}:${row.relname}`));
    expect(afterRelations.filter((row) => !beforeNames.has(`${row.relkind}:${row.relname}`)))
      .toEqual([{ relkind: "i", relname: dispatchIndex }]);
    expect(await publicRoutines(upgrade)).toEqual(beforeRoutines);
  });
});
