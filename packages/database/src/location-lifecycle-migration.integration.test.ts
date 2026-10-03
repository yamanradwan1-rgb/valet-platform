import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectedMigrationDirectories } from "./migration-manifest.js";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const migrationRoot = new URL("../prisma/migrations/", import.meta.url);
const migration = "20260917004000_mgt_be_07_location_management";
const migrationIndex = expectedMigrationDirectories.indexOf(migration);
const suffix = randomUUID().replaceAll("-", "");
const upgradeDatabase = `valet_mgt_be07_upgrade_${suffix}`;
const freshDatabase = `valet_mgt_be07_fresh_${suffix}`;
const ids = {
  activeLocation: randomUUID(),
  audit: randomUUID(),
  inactiveLocation: randomUUID(),
  organization: randomUUID(),
};
let upgrade: Client;
let fresh: Client;

function scopedUrl(database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function apply(client: Client, name: string): Promise<void> {
  const sql = await readFile(
    new URL(`${name}/migration.sql`, migrationRoot),
    "utf8",
  );
  await client.query(sql);
}

async function createDatabase(database: string): Promise<void> {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${database}"`);
  } finally {
    await bootstrap.end();
  }
}

async function dropDatabase(database: string): Promise<void> {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  try {
    await bootstrap.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
  } finally {
    await bootstrap.end();
  }
}

beforeAll(async () => {
  await createDatabase(upgradeDatabase);
  await createDatabase(freshDatabase);

  upgrade = new Client({ connectionString: scopedUrl(upgradeDatabase) });
  await upgrade.connect();
  for (const name of expectedMigrationDirectories.slice(0, migrationIndex)) {
    await apply(upgrade, name);
  }
  await upgrade.query(
    `INSERT INTO organizations(id,name,status,timezone,updated_at)
     VALUES($1,'MGT-BE-07 upgrade','ACTIVE','Asia/Amman',transaction_timestamp())`,
    [ids.organization],
  );
  await upgrade.query(
    `INSERT INTO locations(
       id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
     VALUES
       ($1,$3,'Active before 40','BE07-A','Address','Asia/Amman','JOD','ACTIVE',
        '2026-09-17T12:00:00.000Z'),
       ($2,$3,'Inactive before 40','BE07-I','Address','Asia/Amman','JOD','INACTIVE',
        '2026-09-17T12:00:01.000Z')`,
    [ids.activeLocation, ids.inactiveLocation, ids.organization],
  );
  await upgrade.query(
    `INSERT INTO audit_events(
       id,organization_id,location_id,actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
     VALUES($1,$2,$3,'SYSTEM','PRESERVATION_CANARY','Location',$3,
            '{"before":"migration-40"}'::jsonb,transaction_timestamp())`,
    [ids.audit, ids.organization, ids.activeLocation],
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

describe("MGT-BE-07 migration 40 Location lifecycle", () => {
  it("is the 40th ordered migration and applies cleanly in fresh history", async () => {
    expect(migrationIndex).toBe(39);
    expect(expectedMigrationDirectories).toHaveLength(56);
    expect(expectedMigrationDirectories.at(39)).toBe(migration);
    const column = await fresh.query<{
      column_default: string;
      is_nullable: string;
    }>(
      `SELECT column_default,is_nullable FROM information_schema.columns
       WHERE table_schema='public' AND table_name='locations'
         AND column_name='accepting_intake'`,
    );
    expect(column.rows[0]).toEqual({
      column_default: "false",
      is_nullable: "NO",
    });
    const indexes = await fresh.query<{ indexdef: string; indexname: string }>(
      `SELECT indexname,indexdef FROM pg_indexes
       WHERE schemaname='public' AND indexname=ANY($1::text[])
       ORDER BY indexname`,
      [
        [
          "tasks_location_id_non_terminal_idx",
          "valet_sessions_location_id_non_completed_idx",
        ],
      ],
    );
    expect(indexes.rows).toEqual([
      {
        indexdef: expect.stringContaining(
          "WHERE (status <> ALL (ARRAY['COMPLETED'::task_status, 'CANCELLED'::task_status]))",
        ),
        indexname: "tasks_location_id_non_terminal_idx",
      },
      {
        indexdef: expect.stringContaining(
          "WHERE (state <> ALL (ARRAY['COMPLETED'::valet_session_state, 'CANCELLED'::valet_session_state]))",
        ),
        indexname: "valet_sessions_location_id_non_completed_idx",
      },
    ]);
  });

  it("backfills intake state while preserving existing Location and audit truth", async () => {
    const locations = await upgrade.query<{
      accepting_intake: boolean;
      id: string;
      status: string;
      updated_at: Date;
    }>(
      `SELECT id,status::text,accepting_intake,updated_at
       FROM locations WHERE id=ANY($1::uuid[]) ORDER BY id`,
      [[ids.activeLocation, ids.inactiveLocation]],
    );
    const byId = new Map(locations.rows.map((row) => [row.id, row]));
    expect(byId.get(ids.activeLocation)).toMatchObject({
      accepting_intake: true,
      status: "ACTIVE",
    });
    expect(byId.get(ids.inactiveLocation)).toMatchObject({
      accepting_intake: false,
      status: "INACTIVE",
    });
    expect(byId.get(ids.activeLocation)?.updated_at.toISOString()).toBe(
      "2026-09-17T12:00:00.000Z",
    );
    expect(byId.get(ids.inactiveLocation)?.updated_at.toISOString()).toBe(
      "2026-09-17T12:00:01.000Z",
    );
    const audit = await upgrade.query<{
      event_type: string;
      metadata_json: unknown;
    }>(`SELECT event_type,metadata_json FROM audit_events WHERE id=$1`, [
      ids.audit,
    ]);
    expect(audit.rows[0]).toEqual({
      event_type: "PRESERVATION_CANARY",
      metadata_json: { before: "migration-40" },
    });
  });

  it("defaults new Locations to INACTIVE with intake closed", async () => {
    const id = randomUUID();
    await upgrade.query(
      `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,updated_at)
       VALUES($1,$2,'New after 40',$3,'Address','Asia/Amman','JOD',transaction_timestamp())`,
      [id, ids.organization, `BE07-N-${id}`],
    );
    const state = await upgrade.query<{
      accepting_intake: boolean;
      status: string;
    }>(`SELECT status::text,accepting_intake FROM locations WHERE id=$1`, [id]);
    expect(state.rows[0]).toEqual({
      accepting_intake: false,
      status: "INACTIVE",
    });
  });

  it("rejects intake on an INACTIVE Location", async () => {
    try {
      await upgrade.query(
        `UPDATE locations SET accepting_intake=TRUE WHERE id=$1`,
        [ids.inactiveLocation],
      );
      throw new Error("Expected inactive intake constraint failure.");
    } catch (error) {
      expect((error as PgError).code).toBe("23514");
      expect((error as PgError).constraint).toBe(
        "locations_inactive_intake_closed_check",
      );
    }
  });
});
