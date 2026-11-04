import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PostgresTransaction } from "../src/common/database/postgres";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findGeofenceViolationAlertCaseById,
  queryGeofenceViolationAlertCases,
} from "../src/modules/dashboard/management-alert-sources/geofence-violation-alert-reader";
import { createGpsIngestionCommandExecutor } from "../src/modules/tracking/gps-ingestion-command";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";
import { seedIssue414GeofenceArea } from "./issue414-geofence-area-test-fixture";

// Lease-gated PG17 only. Real GPS writer creates all initial source pairs;
// controlled fixture-only edits probe impossible-to-infer ambiguous history.
const db = new Issue352TakeoverTestContext("414-alt09-negative");
let source: Awaited<ReturnType<typeof db.createStartParkingFixture>>;
let manager: Awaited<ReturnType<typeof db.addMember>>;
let context: Awaited<ReturnType<typeof db.credential>>;
let areaId: string;
let trackerId: string;
let ids: string[];

function input() {
  return {
    context,
    limit: 21,
    scope: {
      organizationId: source.organizationId,
      locationId: source.locationId,
      membershipId: manager.membershipId,
    },
  };
}

const read = () =>
  inPostgresTransaction(db.runtimePool, (tx) =>
    queryGeofenceViolationAlertCases(tx, input()),
  );
const exact = (sourceId: string) =>
  inPostgresTransaction(db.runtimePool, (tx) =>
    findGeofenceViolationAlertCaseById(tx, { ...input(), sourceId }),
  );

async function changePairTime(sourceId: string, timestamp: Date) {
  const changed = await db.adminPool.query(
    `UPDATE geofence_events AS event
     SET recorded_at=$5::timestamptz, occurred_at=$5::timestamptz
     WHERE event.organization_id=$1 AND event.tracking_session_id=$2
       AND event.map_area_id=$3
       AND event.occurred_at=(
         SELECT violation.occurred_at FROM geofence_events AS violation
         WHERE violation.id=$4 AND violation.organization_id=$1
           AND violation.tracking_session_id=$2
       )`,
    [source.organizationId, trackerId, areaId, sourceId, timestamp],
  );
  expect(changed.rowCount).toBe(2); // The writer's ENTERED + VIOLATION pair.
}

async function readAtFixedDbInstant(now: Date) {
  return inPostgresTransaction(db.runtimePool, async (tx) => {
    // Only replace the reader's clock CTE with the explicit PostgreSQL clock
    // captured for this fixture. The production query/predicates run unchanged.
    const pinned = {
      query: (sql: string, params: unknown[]) =>
        sql.includes(
          "WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)",
        )
          ? tx.query(
              sql.replace(
                "WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at)",
                "WITH instant AS MATERIALIZED (SELECT $5::timestamptz AS at)",
              ),
              [...params, now],
            )
          : tx.query(sql, params),
    } as unknown as PostgresTransaction;
    return queryGeofenceViolationAlertCases(pinned, input());
  });
}

beforeAll(async () => {
  await db.setup();
  source = await db.createStartParkingFixture({ assignKey: false });
  await db.adminPool.query(
    "UPDATE organizations SET tracking_enabled=TRUE WHERE id=$1",
    [source.organizationId],
  );
  await db.adminPool.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled=TRUE,status='ACTIVE'
     WHERE organization_id=$1`,
    [source.organizationId],
  );
  await db.start(source, { session: 1, task: 3 });
  manager = await db.addMember(source, "LOCATION_MANAGER", false);
  context = await db.credential(manager.userId);
  areaId = await seedIssue414GeofenceArea(
    db.adminPool,
    source.organizationId,
    source.locationId,
    "RESTRICTED",
  );
  const tracker = await db.adminPool.query<{ id: string }>(
    "SELECT id::text FROM task_tracking_sessions WHERE task_id=$1",
    [source.taskId],
  );
  trackerId = tracker.rows[0]!.id;
  const now = await db.adminPool.query<{ at: Date }>(
    "SELECT clock_timestamp() AS at",
  );
  const outside = { latitude: 33, longitude: 38 };
  const inside = { latitude: 31.5, longitude: 35.5 };
  const positions = [
    outside,
    inside,
    outside,
    inside,
    outside,
    inside,
    outside,
    inside,
    outside,
    inside,
    outside,
  ];
  await createGpsIngestionCommandExecutor(db.runtimePool)({
    authenticatedUserId: source.userId,
    sessionId: source.sessionId,
    samples: positions.map((position, index) => ({
      ...position,
      accuracyMeters: 8,
      clientSampleId: randomUUID(),
      capturedAt: new Date(
        now.rows[0]!.at.getTime() + 100 + index * 100,
      ).toISOString(),
    })),
  });
  const result = await db.adminPool.query<{ id: string }>(
    `SELECT id::text FROM geofence_events
     WHERE tracking_session_id=$1 AND event_type='VIOLATION'
     ORDER BY occurred_at,id`,
    [trackerId],
  );
  ids = result.rows.map((row) => row.id);
  expect(ids).toHaveLength(5);
}, 120_000);

afterAll(() => db.teardown(), 120_000);

describe("ALT09 real PG negative source and precise attention clock", () => {
  it("keeps committed historical entry after live GPS exits, without claiming current status", async () => {
    const cases = await read();
    expect(cases.map((item) => item.sourceId)).toEqual(
      expect.arrayContaining(ids),
    );
    expect(
      cases.every((item) => item.title === "Geofence violation recorded"),
    ).toBe(true);
    expect(JSON.stringify(cases)).not.toMatch(
      /currently|outsideNow|liveStatus|latitude|longitude/i,
    );
    expect(await exact(randomUUID())).toBeNull();
  });

  it("fails closed on a third committed same-ms peer in list AND exact lookup", async () => {
    const sourceId = ids[0]!;
    const duplicate = await db.adminPool.query<{ id: string }>(
      `INSERT INTO geofence_events
       (id,organization_id,location_id,valet_session_id,task_id,
        tracking_session_id,map_area_id,event_type,occurred_at,recorded_at)
       SELECT $2,original.organization_id,original.location_id,
         original.valet_session_id,original.task_id,
         original.tracking_session_id,original.map_area_id,
         original.event_type,original.occurred_at,original.recorded_at
       FROM geofence_events AS original
       WHERE original.tracking_session_id=$1 AND original.map_area_id=$3
         AND original.event_type='ENTERED'
         AND original.occurred_at=(
           SELECT occurred_at FROM geofence_events WHERE id=$4
         ) RETURNING id::text`,
      [trackerId, randomUUID(), areaId, sourceId],
    );
    expect(duplicate.rows).toHaveLength(1);
    expect((await read()).map((item) => item.sourceId)).not.toContain(sourceId);
    expect(await exact(sourceId)).toBeNull();
    expect((await read()).map((item) => item.sourceId)).toContain(ids[1]);
  });

  it("uses inclusive exact 7d clock at a fixed DB instant and excludes older and 8d rows", async () => {
    const clock = await db.adminPool.query<{ at: Date }>(
      "SELECT clock_timestamp() AS at",
    );
    const now = clock.rows[0]!.at;
    const day = 86_400_000;
    await db.adminPool.query(
      `UPDATE task_tracking_sessions SET started_at=$2
       WHERE id=$1`,
      [trackerId, new Date(now.getTime() - 10 * day)],
    );
    await changePairTime(ids[1]!, new Date(now.getTime() - 7 * day));
    await changePairTime(ids[2]!, new Date(now.getTime() - 7 * day - 1));
    await changePairTime(ids[3]!, new Date(now.getTime() - 8 * day));
    await changePairTime(ids[4]!, new Date(now.getTime() - 7 * day + 10_000));
    const pinned = await readAtFixedDbInstant(now);
    expect(pinned.map((item) => item.sourceId)).toContain(ids[1]);
    expect(pinned.map((item) => item.sourceId)).toContain(ids[4]);
    expect(pinned.map((item) => item.sourceId)).not.toContain(ids[2]);
    expect(pinned.map((item) => item.sourceId)).not.toContain(ids[3]);
    // Actual clock advances between statements: equality may already expire.
    const liveIds = (await read()).map((item) => item.sourceId);
    expect(liveIds).toContain(ids[4]);
    expect(liveIds).not.toContain(ids[2]);
    expect(liveIds).not.toContain(ids[3]);
    expect(await exact(ids[2]!)).toBeNull();
    expect(await exact(ids[3]!)).toBeNull();
    expect(await exact(ids[4]!)).toMatchObject({ sourceId: ids[4] });
  });
});
