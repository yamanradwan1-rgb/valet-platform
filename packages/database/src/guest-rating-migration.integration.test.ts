import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

const adminUrl = process.env.TEST_DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const migration = "20260917004200_mgt_be_09_guest_rating";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `valet_mgt_be09_upgrade_${suffix}`;
const freshDatabase = `valet_mgt_be09_fresh_${suffix}`;
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

async function seedCompletedSession(client: Client, label: string) {
  const ids = {
    location: randomUUID(), membership: randomUUID(), organization: randomUUID(),
    session: randomUUID(), user: randomUUID(), vehicle: randomUUID(),
  };
  await client.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,$2,'ACTIVE','Asia/Amman',clock_timestamp())`,
    [ids.organization, `BE09 ${label}`],
  );
  await client.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
     VALUES($1,$2,$3,$4,'Address','Asia/Amman','JOD',clock_timestamp())`,
    [ids.location, ids.organization, label, label],
  );
  await client.query(
    `INSERT INTO users(id,email,password_hash,status,updated_at)
     VALUES($1,$2,'hash','ACTIVE',clock_timestamp())`,
    [ids.user, `${label.toLowerCase()}-${ids.user}@be09.test`],
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
       location_id,vehicle_id,state,checked_in_by_membership_id,completed_at,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'COMPLETED',$6,
            clock_timestamp(),clock_timestamp())`,
    [ids.session, tokenHash("A".repeat(42) + label.slice(0, 1)), ids.organization,
      ids.location, ids.vehicle, ids.membership],
  );
  return ids;
}

beforeAll(async () => {
  await createDatabase(upgradeDatabase);
  await createDatabase(freshDatabase);
  upgrade = new Client({ connectionString: scopedUrl(upgradeDatabase) });
  await upgrade.connect();
  for (const name of expectedMigrationDirectories.slice(0, migrationIndex)) {
    await apply(upgrade, name);
  }
  await seedCompletedSession(upgrade, "Upgrade");
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

describe("MGT-BE-09 migration 42 Guest Rating", () => {
  it("is migration 42 and upgrades existing sessions without fabricating ratings", async () => {
    expect(migrationIndex).toBe(41);
    expect(expectedMigrationDirectories).toHaveLength(42);
    expect(expectedMigrationDirectories.at(41)).toBe(migration);
    expect((await upgrade.query(`SELECT count(*)::int AS n FROM valet_sessions`)).rows[0]?.n).toBe(1);
    expect((await upgrade.query(`SELECT count(*)::int AS n FROM guest_ratings`)).rows[0]?.n).toBe(0);
  });

  it("creates the minimal typed table, one-rating key, range check, and scoped FK", async () => {
    const columns = await fresh.query<{
      column_default: string | null; column_name: string; data_type: string; is_nullable: string;
    }>(
      `SELECT column_name,data_type,is_nullable,column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='guest_ratings' ORDER BY ordinal_position`,
    );
    expect(columns.rows).toEqual([
      { column_default: null, column_name: "organization_id", data_type: "uuid", is_nullable: "NO" },
      { column_default: null, column_name: "location_id", data_type: "uuid", is_nullable: "NO" },
      { column_default: null, column_name: "valet_session_id", data_type: "uuid", is_nullable: "NO" },
      { column_default: null, column_name: "rating", data_type: "integer", is_nullable: "NO" },
      { column_default: "clock_timestamp()", column_name: "rated_at",
        data_type: "timestamp with time zone", is_nullable: "NO" },
    ]);
    const constraints = await fresh.query<{ conname: string; contype: string; definition: string }>(
      `SELECT conname,contype,pg_get_constraintdef(oid,true) AS definition FROM pg_constraint
       WHERE conrelid='public.guest_ratings'::regclass ORDER BY conname`,
    );
    expect(constraints.rows.map(({ conname, contype }) => [conname, contype])).toEqual([
      ["guest_ratings_org_location_session_id_fkey", "f"],
      ["guest_ratings_pkey", "p"],
      ["guest_ratings_rating_check", "c"],
    ]);
    const fk = constraints.rows.find((row) => row.contype === "f")!.definition;
    expect(fk).toContain("FOREIGN KEY (organization_id, location_id, valet_session_id)");
    expect(fk).toContain("REFERENCES valet_sessions(organization_id, location_id, id)");
    expect(fk).toContain("ON UPDATE RESTRICT ON DELETE RESTRICT");
    const indexes = await fresh.query<{ indexdef: string; indexname: string }>(
      `SELECT indexname,indexdef FROM pg_indexes
       WHERE schemaname='public' AND tablename='guest_ratings' ORDER BY indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual([
      "guest_ratings_org_location_session_id_idx",
      "guest_ratings_pkey",
    ]);
    expect(indexes.rows[0]?.indexdef).toContain(
      "(organization_id, location_id, valet_session_id)",
    );
  });

  it("enforces range, composite session scope, and immutable persisted truth", async () => {
    const ids = await seedCompletedSession(fresh, "Fresh");
    for (const rating of [0, 6]) {
      await expect(fresh.query(
        `INSERT INTO guest_ratings(organization_id,location_id,valet_session_id,rating)
         VALUES($1,$2,$3,$4)`, [ids.organization, ids.location, ids.session, rating],
      )).rejects.toMatchObject({ code: "23514", constraint: "guest_ratings_rating_check" });
    }
    await expect(fresh.query(
      `INSERT INTO guest_ratings(organization_id,location_id,valet_session_id,rating)
       VALUES($1,$2,$3,3)`, [ids.organization, randomUUID(), ids.session],
    )).rejects.toMatchObject({
      code: "23503", constraint: "guest_ratings_org_location_session_id_fkey",
    });
    await fresh.query(
      `INSERT INTO guest_ratings(organization_id,location_id,valet_session_id,rating)
       VALUES($1,$2,$3,5)`, [ids.organization, ids.location, ids.session],
    );
    await expect(fresh.query(`UPDATE guest_ratings SET rating=4 WHERE valet_session_id=$1`, [ids.session]))
      .rejects.toMatchObject({ code: "55000" });
    await expect(fresh.query(`DELETE FROM guest_ratings WHERE valet_session_id=$1`, [ids.session]))
      .rejects.toMatchObject({ code: "55000" });
    await expect(fresh.query(`DELETE FROM valet_sessions WHERE id=$1`, [ids.session]))
      .rejects.toMatchObject({
        code: "23503", constraint: "guest_ratings_org_location_session_id_fkey",
      });
    expect((await fresh.query(`SELECT rating FROM guest_ratings WHERE valet_session_id=$1`,
      [ids.session])).rows[0]?.rating).toBe(5);
  });
});
