import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl = process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const migration = "20260917004300_mgt_be_10_kpi_analytics";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `valet_mgt_be10_upgrade_${suffix}`;
const freshDatabase = `valet_mgt_be10_fresh_${suffix}`;
let upgrade: Client;
let fresh: Client;

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

async function seedScope(client: Client, label: string) {
  const ids = {
    location: randomUUID(), membership: randomUUID(), organization: randomUUID(),
    session: randomUUID(), user: randomUUID(), vehicle: randomUUID(),
  };
  await client.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,$2,'ACTIVE','Asia/Amman',clock_timestamp())`,
    [ids.organization, `BE10 ${label}`],
  );
  await client.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES($1,$2,$3,$4,'Address','Asia/Amman','JOD',clock_timestamp())`,
    [ids.location, ids.organization, label, label],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [ids.user, `${ids.user}@be10.test`],
  );
  await client.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [ids.membership, ids.organization, ids.user],
  );
  await client.query(
    `INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at)
     VALUES($1,$2,$3,clock_timestamp())`,
    [ids.vehicle, ids.organization, `Vehicle ${label}`],
  );
  await client.query(
    `INSERT INTO valet_sessions(
       id,customer_access_token_hash,customer_access_expires_at,organization_id,
       location_id,vehicle_id,state,checked_in_by_membership_id,
       retrieval_requested_at,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'REQUESTED',$6,
            '2026-09-17T09:00:00Z',clock_timestamp())`,
    [ids.session, tokenHash(`${label}-${ids.session}`), ids.organization,
      ids.location, ids.vehicle, ids.membership],
  );
  return ids;
}

async function insertRequest(
  client: Client,
  ids: Awaited<ReturnType<typeof seedScope>>,
  requestedAt: string,
  snapshot?: number,
) {
  const id = randomUUID();
  await client.query(
    `INSERT INTO retrieval_requests(
       id,organization_id,valet_session_id,requested_by_type,status,requested_at,
       sla_target_seconds_snapshot)
     VALUES($1,$2,$3,'CUSTOMER','OPEN',$4,$5)`,
    [id, ids.organization, ids.session, requestedAt, snapshot ?? null],
  );
  return id;
}

beforeAll(async () => {
  await createDatabase(upgradeDatabase);
  await createDatabase(freshDatabase);
  upgrade = new Client({ connectionString: scopedUrl(upgradeDatabase) });
  await upgrade.connect();
  for (const name of expectedMigrationDirectories.slice(0, migrationIndex)) {
    await apply(upgrade, name);
  }
  const existing = await seedScope(upgrade, "Upgrade");
  await upgrade.query(
    `INSERT INTO retrieval_requests(id,organization_id,valet_session_id,requested_by_type,status,requested_at)
     VALUES($1,$2,$3,'CUSTOMER','OPEN','2026-09-17T09:00:00Z')`,
    [randomUUID(), existing.organization, existing.session],
  );
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

describe("MGT-BE-10 migration 43 KPI source contracts", () => {
  it("is migration 43 and upgrades old rows without backfilling SLA truth", async () => {
    expect(migrationIndex).toBe(42);
    expect(expectedMigrationDirectories).toHaveLength(45);
    expect(expectedMigrationDirectories.at(42)).toBe(migration);
    const row = (await upgrade.query(
      `SELECT location.sla_target_seconds, request.sla_target_seconds_snapshot
       FROM locations location JOIN valet_sessions session ON session.location_id=location.id
       JOIN retrieval_requests request ON request.valet_session_id=session.id LIMIT 1`,
    )).rows[0];
    expect(row).toEqual({ sla_target_seconds: null, sla_target_seconds_snapshot: null });
  });

  it("adds typed nullable range constraints and no KeyException table", async () => {
    const columns = await fresh.query<{ column_name: string; column_default: string | null }>(
      `SELECT column_name,column_default FROM information_schema.columns
       WHERE table_schema='public'
         AND (table_name='locations' AND column_name='sla_target_seconds'
           OR table_name='retrieval_requests' AND column_name='sla_target_seconds_snapshot')
       ORDER BY column_name`,
    );
    expect(columns.rows).toEqual([
      { column_default: null, column_name: "sla_target_seconds" },
      { column_default: null, column_name: "sla_target_seconds_snapshot" },
    ]);
    expect((await fresh.query(
      `SELECT to_regclass('public.key_exceptions') AS relation`,
    )).rows[0]?.relation).toBeNull();
    const indexes = await fresh.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname='public' AND indexname LIKE '%kpi%'
       ORDER BY indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "dispatch_events_kpi_work_evidence_idx",
      "handoff_verifications_kpi_work_evidence_idx",
      "key_custody_events_kpi_work_evidence_idx",
      "retrieval_requests_org_requested_at_kpi_idx",
      "valet_sessions_org_location_completed_at_kpi_idx",
      "vehicle_photos_kpi_work_evidence_idx",
    ]);
  });

  it("derives immutable per-attempt snapshots and later requests use later targets", async () => {
    const ids = await seedScope(fresh, "Snapshot");
    for (const target of [29, 3601]) {
      await expect(fresh.query(
        `UPDATE locations SET sla_target_seconds=$2 WHERE id=$1`, [ids.location, target],
      )).rejects.toMatchObject({ code: "23514", constraint: "locations_sla_target_seconds_check" });
    }
    await fresh.query(`UPDATE locations SET sla_target_seconds=300 WHERE id=$1`, [ids.location]);
    const first = await insertRequest(fresh, ids, "2026-09-17T09:00:00Z", 999);
    expect((await fresh.query(
      `SELECT sla_target_seconds_snapshot AS value FROM retrieval_requests WHERE id=$1`, [first],
    )).rows[0]?.value).toBe(300);
    await fresh.query(`UPDATE locations SET sla_target_seconds=420 WHERE id=$1`, [ids.location]);
    await expect(fresh.query(
      `UPDATE retrieval_requests SET sla_target_seconds_snapshot=420 WHERE id=$1`, [first],
    )).rejects.toMatchObject({ code: "55000" });
    await fresh.query(
      `UPDATE retrieval_requests SET status='CANCELLED',cancelled_at=clock_timestamp() WHERE id=$1`, [first],
    );
    await fresh.query(
      `UPDATE valet_sessions SET retrieval_requested_at='2026-09-17T10:00:00Z' WHERE id=$1`, [ids.session],
    );
    const second = await insertRequest(fresh, ids, "2026-09-17T10:00:00Z");
    const rows = await fresh.query<{ value: number }>(
      `SELECT sla_target_seconds_snapshot AS value FROM retrieval_requests
       WHERE id=ANY($1::uuid[]) ORDER BY requested_at`, [[first, second]],
    );
    expect(rows.rows.map((row) => row.value)).toEqual([300, 420]);
  });
});
