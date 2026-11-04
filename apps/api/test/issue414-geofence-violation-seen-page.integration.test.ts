import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findGeofenceViolationAlertCaseById,
  queryGeofenceViolationAlertCases,
} from "../src/modules/dashboard/management-alert-sources/geofence-violation-alert-reader";
import { createGpsIngestionCommandExecutor } from "../src/modules/tracking/gps-ingestion-command";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";
import { seedIssue414GeofenceArea } from "./issue414-geofence-area-test-fixture";

// Disposable PG17 with W18 Seen migration, only under Prime-granted lease.
// Source events come from real GPS, never direct VIOLATION inserts.
const db = new Issue352TakeoverTestContext("414-alt09-seen-page");
let source: Awaited<ReturnType<typeof db.createStartParkingFixture>>;
let manager: Awaited<ReturnType<typeof db.addMember>>;
let context: Awaited<ReturnType<typeof db.credential>>;

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
const list = () =>
  inPostgresTransaction(db.runtimePool, (tx) =>
    queryGeofenceViolationAlertCases(tx, input()),
  );
const exact = (sourceId: string) =>
  inPostgresTransaction(db.runtimePool, (tx) =>
    findGeofenceViolationAlertCaseById(tx, { ...input(), sourceId }),
  );

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
  await seedIssue414GeofenceArea(
    db.adminPool,
    source.organizationId,
    source.locationId,
    "RESTRICTED",
  );

  const clock = await db.adminPool.query<{ at: Date }>(
    "SELECT clock_timestamp() AS at",
  );
  const stamp = clock.rows[0]!.at.getTime() + 200;
  const outside = { latitude: 33, longitude: 38 };
  const inside = { latitude: 31.5, longitude: 35.5 };
  const writer = createGpsIngestionCommandExecutor(db.runtimePool);
  for (let start = 0; start < 60; start += 30) {
    await writer({
      authenticatedUserId: source.userId,
      sessionId: source.sessionId,
      samples: Array.from({ length: 30 }, (_, offset) => {
        const index = start + offset;
        return {
          ...(index % 2 === 0 ? outside : inside),
          accuracyMeters: 8,
          clientSampleId: randomUUID(),
          capturedAt: new Date(stamp + index * 100).toISOString(),
        };
      }),
    });
  }
  const violations = await db.adminPool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM geofence_events
     WHERE organization_id=$1 AND location_id=$2
       AND event_type='VIOLATION'`,
    [source.organizationId, source.locationId],
  );
  expect(violations.rows[0]?.count).toBe(30);
}, 120_000);

afterAll(() => db.teardown(), 120_000);

describe("ALT09 list pages must select unseen BEFORE LIMIT21", () => {
  it("fills all 21 results with new occurrences when first 8 are Seen", async () => {
    const initial = await list();
    expect(initial).toHaveLength(21);
    const acknowledged = initial.slice(0, 8).map((item) => item.sourceId);
    const oldUnseen = initial.slice(8).map((item) => item.sourceId);
    await db.adminPool.query(
      `INSERT INTO management_alert_seen_receipts
         (organization_id,user_id,category,source_id,geofence_event_id)
       SELECT $1,$2,'ALT-09', source.id, source.id
       FROM unnest($3::uuid[]) AS source(id)`,
      [source.organizationId, manager.userId, acknowledged],
    );
    const current = await list();
    const currentIds = current.map((item) => item.sourceId);
    expect(current).toHaveLength(21);
    expect(new Set(currentIds).size).toBe(21);
    for (const seen of acknowledged) {
      expect(currentIds).not.toContain(seen);
      expect(await exact(seen)).toMatchObject({
        category: "ALT-09",
        sourceId: seen,
        episodeId: seen,
      });
    }
    for (const old of oldUnseen) expect(currentIds).toContain(old);
    const replacements = currentIds.filter((id) => !oldUnseen.includes(id));
    expect(replacements).toHaveLength(8);
    expect(replacements.every((id) => !acknowledged.includes(id))).toBe(true);
    expect(await exact(randomUUID())).toBeNull();
  });
});
