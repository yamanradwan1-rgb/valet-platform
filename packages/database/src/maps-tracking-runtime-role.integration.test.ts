import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMapsTrackingFixture } from "./maps-tracking-fixture.js";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const suffix = `${process.pid}_${Date.now()}`;
const databaseName = `valet_007a_role_${suffix}`;
const runtimeRole = `valet_007a_runtime_${suffix}`;
const runtimePassword = `runtime-${randomUUID()}`;
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prismaCli = fileURLToPath(
  new URL("../node_modules/prisma/build/index.js", import.meta.url),
);
let adminPool: Pool;
let runtimePool: Pool;

function scopedUrl(role?: string, password?: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  if (role !== undefined) url.username = role;
  if (password !== undefined) url.password = password;
  return url.toString();
}

async function runScript(
  args: string[],
  migrationUrl: string,
  runtimeUrl?: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: packageRoot,
      env: {
        ...process.env,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
        NODE_ENV: "test",
      },
    });
    let output = "";
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Database script failed: ${output}`)),
    );
  });
}

async function expectDenied(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL privilege denial.");
  } catch (error) {
    expect((error as PgError).code).toBe("42501");
  }
}

async function expectConstraint(
  operation: Promise<unknown>,
  constraint: string,
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected PostgreSQL constraint ${constraint}.`);
  } catch (error) {
    expect((error as PgError).code).toBe("23514");
    expect((error as PgError).constraint).toBe(constraint);
  }
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const migrationUrl = scopedUrl();
  const runtimeUrl = scopedUrl(runtimeRole, runtimePassword);
  await runScript([prismaCli, "migrate", "deploy"], migrationUrl);
  await runScript(
    ["scripts/provision-runtime-role.mjs"],
    migrationUrl,
    runtimeUrl,
  );
  adminPool = new Pool({ connectionString: migrationUrl });
  runtimePool = new Pool({ connectionString: runtimeUrl });
}, 120_000);

afterAll(async () => {
  await runtimePool?.end();
  await adminPool?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.query(`DROP ROLE IF EXISTS "${runtimeRole}"`);
  await bootstrap.end();
}, 60_000);

describe("DEC-046 runtime role boundary", () => {
  it("keeps geometry read-only and tracking history append-only", async () => {
    const result = await adminPool.query<{
      can_delete: boolean;
      can_insert: boolean;
      can_select: boolean;
      can_truncate: boolean;
      can_update: boolean;
      table_name: string;
    }>(
      `SELECT table_name,
              has_table_privilege($1, format('public.%I', table_name), 'SELECT') AS can_select,
              has_table_privilege($1, format('public.%I', table_name), 'INSERT') AS can_insert,
              has_table_privilege($1, format('public.%I', table_name), 'UPDATE') AS can_update,
              has_table_privilege($1, format('public.%I', table_name), 'DELETE') AS can_delete,
              has_table_privilege($1, format('public.%I', table_name), 'TRUNCATE') AS can_truncate
       FROM unnest($2::text[]) AS table_name ORDER BY table_name`,
      [
        runtimeRole,
        [
          "geofence_events",
          "location_map_area_vertices",
          "location_map_areas",
          "location_map_points",
          "raw_gps_samples",
          "task_tracking_sessions",
        ],
      ],
    );
    const rows = Object.fromEntries(
      result.rows.map((row) => [row.table_name, row]),
    );
    for (const table of [
      "location_map_area_vertices",
      "location_map_areas",
      "location_map_points",
    ]) {
      expect(rows[table]).toMatchObject({
        can_delete: false,
        can_insert: false,
        can_select: true,
        can_truncate: false,
        can_update: false,
      });
    }
    for (const table of ["geofence_events", "raw_gps_samples"]) {
      expect(rows[table]).toMatchObject({
        can_delete: false,
        can_insert: true,
        can_select: true,
        can_truncate: false,
        can_update: false,
      });
    }
    expect(rows.task_tracking_sessions).toMatchObject({
      can_delete: false,
      can_insert: true,
      can_select: true,
      can_truncate: false,
      can_update: false,
    });
  });

  it("allows only ended_at mutation on tracking sessions", async () => {
    const columns = await adminPool.query<{
      can_update: boolean;
      column_name: string;
    }>(
      `SELECT column_name,
              has_column_privilege($1, 'public.task_tracking_sessions',
                                   column_name, 'UPDATE') AS can_update
       FROM unnest(ARRAY['ended_at', 'started_at', 'task_id', 'organization_id',
                         'valet_session_id'])
            AS column_name ORDER BY column_name`,
      [runtimeRole],
    );
    expect(columns.rows).toEqual([
      { can_update: true, column_name: "ended_at" },
      { can_update: false, column_name: "organization_id" },
      { can_update: false, column_name: "started_at" },
      { can_update: false, column_name: "task_id" },
      { can_update: false, column_name: "valet_session_id" },
    ]);
    await expectDenied(runtimePool.query(`TRUNCATE raw_gps_samples`));
    await expectDenied(runtimePool.query(`DELETE FROM geofence_events`));
    await expectDenied(
      runtimePool.query(`UPDATE raw_gps_samples SET latitude = 0`),
    );
  });

  it("enforces a one-way ended_at transition through the runtime role", async () => {
    const fixture = await createMapsTrackingFixture(adminPool);
    const firstEnd = await runtimePool.query<{ ended_at: Date }>(
      `UPDATE task_tracking_sessions
       SET ended_at = started_at + interval '1 second'
       WHERE id = $1
       RETURNING ended_at`,
      [fixture.trackingSessionId],
    );
    expect(firstEnd.rowCount).toBe(1);
    const endedAt = firstEnd.rows[0]?.ended_at;
    expect(endedAt).toBeInstanceOf(Date);

    const identical = await runtimePool.query(
      `UPDATE task_tracking_sessions SET ended_at = $2 WHERE id = $1`,
      [fixture.trackingSessionId, endedAt],
    );
    expect(identical.rowCount).toBe(1);

    await expectConstraint(
      runtimePool.query(
        `UPDATE task_tracking_sessions SET ended_at = NULL WHERE id = $1`,
        [fixture.trackingSessionId],
      ),
      "task_tracking_sessions_ended_at_once_check",
    );
    await expectConstraint(
      runtimePool.query(
        `UPDATE task_tracking_sessions
         SET ended_at = ended_at + interval '1 second' WHERE id = $1`,
        [fixture.trackingSessionId],
      ),
      "task_tracking_sessions_ended_at_once_check",
    );

    const active = await createMapsTrackingFixture(adminPool);
    await expectConstraint(
      runtimePool.query(
        `UPDATE task_tracking_sessions
         SET ended_at = started_at - interval '1 millisecond' WHERE id = $1`,
        [active.trackingSessionId],
      ),
      "task_tracking_sessions_time_order_check",
    );
    for (const column of ["started_at", "task_id", "valet_session_id"]) {
      await expectDenied(
        runtimePool.query(
          `UPDATE task_tracking_sessions SET ${column} = ${column} WHERE id = $1`,
          [active.trackingSessionId],
        ),
      );
    }
  });

  it("does not expand DDL, ownership, or unsafe role attributes", async () => {
    await expectDenied(
      runtimePool.query(`CREATE TABLE runtime_owned (id int)`),
    );
    const result = await adminPool.query<{
      owned: number;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolsuper: boolean;
    }>(
      `SELECT role.rolsuper, role.rolcreatedb, role.rolcreaterole,
              count(object.oid)::integer AS owned
       FROM pg_roles role
       LEFT JOIN pg_class object ON object.relowner = role.oid
       LEFT JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
         AND namespace.nspname = 'public'
       WHERE role.rolname = $1
       GROUP BY role.rolsuper, role.rolcreatedb, role.rolcreaterole`,
      [runtimeRole],
    );
    expect(result.rows[0]).toEqual({
      owned: 0,
      rolcreatedb: false,
      rolcreaterole: false,
      rolsuper: false,
    });
  });
});
