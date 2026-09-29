import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  MapSetupTestContext,
  validArea,
  validPoint,
} from "./map-setup-test-context";

interface PgError extends Error {
  readonly code?: string;
}

const context = new MapSetupTestContext("map-review-fix");
const pointPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/points`;
const areaPath = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map/areas`;

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function expectPgCode(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation;
    throw new Error("Expected PostgreSQL to reject the operation.");
  } catch (error) {
    expect((error as PgError).code).toBe(expectedCode);
  }
}

async function waitForPointUpdateLock(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const activity = await context.database.adminPool.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE usename = $1 AND wait_event_type = 'Lock'
           AND query LIKE '%map_setup_update_point%'
       ) AS blocked`,
      [context.database.runtimeRole],
    );
    if (activity.rows[0]?.blocked === true) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for the point update row lock.");
}

async function commitConcurrentPointChange(
  locker: PoolClient,
  pointId: string,
): Promise<void> {
  await locker.query("BEGIN");
  await locker.query(
    `UPDATE location_map_points
     SET label = 'Committed elsewhere',
         updated_at = updated_at + INTERVAL '1 second'
     WHERE id = $1`,
    [pointId],
  );
}

describe("VAL-007B final persistence review fixes", () => {
  it("rejects a stale disjoint HTTP PATCH with 409 and no false audit", async () => {
    const actor = await context.actor();
    const created = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      { body: validPoint, token: actor.token },
    );
    const pointId = String(created.body.id);
    const locker = await context.database.adminPool.connect();
    try {
      await commitConcurrentPointChange(locker, pointId);
      const pending = context.request(
        "PATCH",
        `${pointPath(actor.fixture.locationId)}/${pointId}`,
        {
          body: { active: false, expectedUpdatedAt: created.body.updatedAt },
          token: actor.token,
        },
      );
      await waitForPointUpdateLock();
      await locker.query("COMMIT");
      const response = await pending;
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "MAP_SETUP_CONFLICT" });
      expect(JSON.stringify(response.body)).not.toMatch(/updated_at|timestamp/i);
    } finally {
      await locker.query("ROLLBACK");
      locker.release();
    }
    const persisted = await context.database.adminPool.query(
      `SELECT label, active FROM location_map_points WHERE id = $1`,
      [pointId],
    );
    expect(persisted.rows[0]).toEqual({ active: true, label: "Committed elsewhere" });
    expect((await context.audit(pointId)).rows).toHaveLength(1);
  });

  it("allows one point update and rejects a second stale projection", async () => {
    const actor = await context.actor();
    const created = await context.request(
      "POST",
      pointPath(actor.fixture.locationId),
      { body: validPoint, token: actor.token },
    );
    const pointId = String(created.body.id);
    const update = (label: string, active: boolean) =>
      context.database.runtimePool.query(
        `SELECT map_setup_update_point(
           $1, $2, $3, 'ENTRANCE', $4, $5, $6, $7, $8, $9, $10
         )`,
        [
          actor.fixture.membershipId,
          actor.fixture.locationId,
          pointId,
          validPoint.code,
          label,
          validPoint.latitude,
          validPoint.longitude,
          validPoint.levelLabel,
          active,
          created.body.updatedAt,
        ],
      );
    await expect(update("North entrance", true)).resolves.toBeDefined();
    await expectPgCode(update(validPoint.label, false), "40001");
    const persisted = await context.database.adminPool.query(
      `SELECT label, active FROM location_map_points WHERE id = $1`,
      [pointId],
    );
    expect(persisted.rows[0]).toEqual({ active: true, label: "North entrance" });
    expect((await context.audit(pointId)).rows).toHaveLength(2);
  });

  it("conflicts stale area metadata after vertex replacement", async () => {
    const actor = await context.actor();
    const created = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      { body: validArea, token: actor.token },
    );
    const areaId = String(created.body.id);
    const replacement = [10, 11, 12];
    await context.database.runtimePool.query(
      `SELECT map_setup_replace_area_vertices($1, $2, $3, $4, $5, $6)`,
      [
        actor.fixture.membershipId,
        actor.fixture.locationId,
        areaId,
        replacement,
        [20, 21, 22],
        created.body.updatedAt,
      ],
    );
    await expectPgCode(
      context.database.runtimePool.query(
        `SELECT map_setup_update_area(
           $1, $2, $3, 'PARKING', $4, $5, $6, $7, $8, $9
         )`,
        [
          actor.fixture.membershipId,
          actor.fixture.locationId,
          areaId,
          validArea.code,
          "Stale label",
          validArea.levelLabel,
          validArea.active,
          null,
          created.body.updatedAt,
        ],
      ),
      "40001",
    );
    const listed = await context.request(
      "GET",
      areaPath(actor.fixture.locationId),
      { token: actor.token },
    );
    const area = (listed.body.areas as Array<Record<string, unknown>>)[0];
    expect(area?.label).toBe(validArea.label);
    expect(area?.vertices).toEqual(
      replacement.map((latitude, position) => ({
        latitude,
        longitude: 20 + position,
        position,
      })),
    );
    expect((await context.audit(areaId)).rows).toHaveLength(2);
  });

  it("rejects 501 vertices before create or replacement persistence", async () => {
    const actor = await context.actor();
    const latitudes = Array<number>(501).fill(10);
    const longitudes = Array<number>(501).fill(20);
    const oversizedAreaId = randomUUID();
    await expectPgCode(
      context.database.runtimePool.query(
        `SELECT map_setup_create_area(
           $1, $2, $3, 'PARKING', $4, $5, NULL, true, NULL, $6, $7
         )`,
        [
          actor.fixture.membershipId,
          actor.fixture.locationId,
          oversizedAreaId,
          "OVERSIZED",
          "Oversized polygon",
          latitudes,
          longitudes,
        ],
      ),
      "22023",
    );
    expect((await context.audit(oversizedAreaId)).rows).toHaveLength(0);
    const absent = await context.database.adminPool.query(
      `SELECT id FROM location_map_areas WHERE id = $1`,
      [oversizedAreaId],
    );
    expect(absent.rows).toHaveLength(0);

    const created = await context.request(
      "POST",
      areaPath(actor.fixture.locationId),
      { body: validArea, token: actor.token },
    );
    const areaId = String(created.body.id);
    await expectPgCode(
      context.database.runtimePool.query(
        `SELECT map_setup_replace_area_vertices($1, $2, $3, $4, $5, $6)`,
        [
          actor.fixture.membershipId,
          actor.fixture.locationId,
          areaId,
          latitudes,
          longitudes,
          created.body.updatedAt,
        ],
      ),
      "22023",
    );
    const vertices = await context.database.adminPool.query(
      `SELECT position, latitude::float8 AS latitude,
              longitude::float8 AS longitude
       FROM location_map_area_vertices WHERE map_area_id = $1
       ORDER BY position`,
      [areaId],
    );
    expect(vertices.rows).toEqual(
      validArea.vertices.map((vertex, position) => ({ ...vertex, position })),
    );
    expect((await context.audit(areaId)).rows).toHaveLength(1);
  });
});
