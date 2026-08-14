import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createMapArea,
  createMapsTrackingFixture,
  createTrackingSession,
  insertRawGpsSample,
} from "./maps-tracking-fixture.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";
import {
  createTask,
  createTaskDispatchScope,
} from "./task-dispatch-fixture.js";

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

const adminUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";
const databaseName = `valet_007a_${process.pid}_${Date.now()}`;
const migrationsPath = fileURLToPath(
  new URL("../prisma/migrations", import.meta.url),
);
let client: Client;

async function expectConstraint(
  operation: Promise<unknown>,
  constraint: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL constraint failure.");
  } catch (error) {
    const pgError = error as PgError;
    expect(["23503", "23505", "23514"]).toContain(pgError.code);
    expect(pgError.constraint).toBe(constraint);
  }
}

beforeAll(async () => {
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`CREATE DATABASE "${databaseName}"`);
  await bootstrap.end();
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  client = new Client({ connectionString: url.toString() });
  await client.connect();
  for (const migration of expectedMigrationDirectories) {
    const sql = await readFile(
      join(migrationsPath, migration, "migration.sql"),
      "utf8",
    );
    await client.query(sql);
  }
}, 120_000);

afterAll(async () => {
  await client?.end();
  const bootstrap = new Client({ connectionString: adminUrl });
  await bootstrap.connect();
  await bootstrap.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  await bootstrap.end();
}, 60_000);

describe("DEC-046 maps and tracking persistence", () => {
  it("applies migration 23 with the accepted typed tables and policy defaults", async () => {
    expect(expectedMigrationDirectories).toHaveLength(24);
    expect(expectedMigrationDirectories.at(22)).toBe(
      "20260814002300_phase5_maps_tracking_persistence",
    );
    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [
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
    expect(tables.rows).toHaveLength(6);
    const enums = await client.query<{ labels: string[]; typname: string }>(
      `SELECT type.typname, json_agg(value.enumlabel ORDER BY value.enumsortorder) AS labels
       FROM pg_type type JOIN pg_enum value ON value.enumtypid = type.oid
       WHERE type.typname = ANY($1::text[]) GROUP BY type.typname ORDER BY type.typname`,
      [
        [
          "geofence_event_type",
          "location_map_area_purpose",
          "location_map_point_kind",
        ],
      ],
    );
    expect(enums.rows).toEqual([
      {
        labels: ["ENTERED", "EXITED", "VIOLATION"],
        typname: "geofence_event_type",
      },
      {
        labels: ["PARKING", "OVERFLOW", "STAGING", "RESTRICTED"],
        typname: "location_map_area_purpose",
      },
      {
        labels: ["ENTRANCE", "PICKUP", "DROP_OFF"],
        typname: "location_map_point_kind",
      },
    ]);
    const scope = await createTaskDispatchScope(client);
    const defaults = await client.query<{
      raw_gps_retention_days: number;
      raw_gps_retention_days_override: number | null;
      tracking_enabled: boolean;
      tracking_enabled_override: boolean | null;
    }>(
      `SELECT o.tracking_enabled, o.raw_gps_retention_days,
              l.tracking_enabled_override, l.raw_gps_retention_days_override
       FROM organizations o JOIN locations l ON l.organization_id = o.id
       WHERE l.id = $1`,
      [scope.locationId],
    );
    expect(defaults.rows[0]).toEqual({
      raw_gps_retention_days: 30,
      raw_gps_retention_days_override: null,
      tracking_enabled: false,
      tracking_enabled_override: null,
    });
    await client.query(
      `UPDATE locations SET tracking_enabled_override = true,
       raw_gps_retention_days_override = 14 WHERE id = $1`,
      [scope.locationId],
    );
    await expectConstraint(
      client.query(
        `UPDATE organizations SET raw_gps_retention_days = 0 WHERE id = $1`,
        [scope.organizationId],
      ),
      "organizations_raw_gps_retention_days_check",
    );
    await expectConstraint(
      client.query(
        `UPDATE locations SET raw_gps_retention_days_override = -1 WHERE id = $1`,
        [scope.locationId],
      ),
      "locations_raw_gps_retention_days_override_check",
    );
  });

  it("enforces geometry coordinate and exact ParkingZone scope", async () => {
    const first = await createTaskDispatchScope(client);
    const second = await createTaskDispatchScope(client);
    const point = (latitude: number, longitude: number) =>
      client.query(
        `INSERT INTO location_map_points
         (id, organization_id, location_id, kind, code, label, latitude,
          longitude, updated_at)
         VALUES ($1, $2, $3, 'ENTRANCE', $4, 'Entrance', $5, $6,
                 transaction_timestamp())`,
        [
          randomUUID(),
          first.organizationId,
          first.locationId,
          randomUUID(),
          latitude,
          longitude,
        ],
      );
    await expectConstraint(point(91, 35), "location_map_points_latitude_check");
    await expectConstraint(
      point(31, -181),
      "location_map_points_longitude_check",
    );
    await expectConstraint(
      client.query(
        `INSERT INTO location_map_points
         (id, organization_id, location_id, kind, code, label, latitude,
          longitude, updated_at)
         VALUES ($1, $2, $3, 'PICKUP', $4, 'Wrong scope', 31, 35,
                 transaction_timestamp())`,
        [randomUUID(), first.organizationId, second.locationId, randomUUID()],
      ),
      "location_map_points_org_location_id_fkey",
    );
    const zoneId = randomUUID();
    await client.query(
      `INSERT INTO parking_zones
       (id, organization_id, location_id, code, label, updated_at)
       VALUES ($1, $2, $3, $4, 'Zone', transaction_timestamp())`,
      [zoneId, second.organizationId, second.locationId, randomUUID()],
    );
    await expectConstraint(
      createMapArea(client, first, zoneId),
      "location_map_areas_org_location_parking_zone_id_fkey",
    );
    const areaId = await createMapArea(client, first);
    const vertexId = randomUUID();
    const vertex = (id: string, position: number) =>
      client.query(
        `INSERT INTO location_map_area_vertices
         (id, organization_id, location_id, map_area_id, position, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, 31, 35)`,
        [id, first.organizationId, first.locationId, areaId, position],
      );
    await vertex(vertexId, 0);
    await expectConstraint(
      vertex(randomUUID(), 0),
      "location_map_area_vertices_area_position_key",
    );
  });

  it("prevents cross-session scope and duplicate active trackers", async () => {
    const first = await createTaskDispatchScope(client);
    const second = await createTaskDispatchScope(client);
    const parkingTask = await createTask(client, first);
    await createTrackingSession(client, first, parkingTask);
    await expectConstraint(
      createTrackingSession(client, first, parkingTask),
      "task_tracking_sessions_one_active_per_task_idx",
    );
    const retrievalTask = await createTask(client, first, {
      taskType: "RETRIEVAL",
    });
    await expectConstraint(
      createTrackingSession(client, first, retrievalTask),
      "task_tracking_sessions_one_active_per_session_idx",
    );
    const cleanScope = await createTaskDispatchScope(client);
    const foreignTask = await createTask(client, second);
    await expectConstraint(
      createTrackingSession(client, cleanScope, foreignTask),
      "task_tracking_sessions_task_scope_id_fkey",
    );
  });

  it("deduplicates raw samples and rejects invalid or crossed tracking scope", async () => {
    const fixture = await createMapsTrackingFixture(client);
    const clientSampleId = randomUUID();
    await insertRawGpsSample(client, fixture, clientSampleId);
    await expectConstraint(
      insertRawGpsSample(client, fixture, clientSampleId),
      "raw_gps_samples_tracking_client_sample_key",
    );
    await expectConstraint(
      insertRawGpsSample(client, fixture, randomUUID(), 90.1, 35),
      "raw_gps_samples_latitude_check",
    );
    await expectConstraint(
      insertRawGpsSample(client, fixture, randomUUID(), 31, 180.1),
      "raw_gps_samples_longitude_check",
    );
    const other = await createMapsTrackingFixture(client);
    await expectConstraint(
      client.query(
        `INSERT INTO geofence_events
         (id, organization_id, location_id, valet_session_id, task_id,
          tracking_session_id, map_area_id, event_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'VIOLATION')`,
        [
          randomUUID(),
          fixture.organizationId,
          fixture.locationId,
          fixture.valetSessionId,
          fixture.taskId,
          fixture.trackingSessionId,
          other.mapAreaId,
        ],
      ),
      "geofence_events_scope_map_area_id_fkey",
    );
  });
});
