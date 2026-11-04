import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffSessionContext } from "../src/modules/auth/staff-session-context";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import { createEmergencyTakeoverCommandExecutor } from "../src/modules/dispatch/emergency-takeover-command";
import { createGpsIngestionCommandExecutor } from "../src/modules/tracking/gps-ingestion-command";
import {
  findGeofenceViolationAlertCaseById,
  queryGeofenceViolationAlertCases,
} from "../src/modules/dashboard/management-alert-sources/geofence-violation-alert-reader";
import { Issue352TakeoverTestContext } from "./issue352-takeover-test-context";
import { seedIssue414GeofenceArea } from "./issue414-geofence-area-test-fixture";

// Execute ONLY after Prime releases the exclusive disposable PG17 lease.
// The reader also requires W18's forward-only Seen migration in this DB.
const db = new Issue352TakeoverTestContext("414-alt09-real-gps");
const ingest = () => createGpsIngestionCommandExecutor(db.runtimePool);
const takeover = () => createEmergencyTakeoverCommandExecutor(db.runtimePool);
type Member = Awaited<ReturnType<typeof db.addMember>>;
type Parking = Awaited<ReturnType<typeof db.createStartParkingFixture>>;

let source: Parking;
let lm: Member;
let admin: Member;
let replacement: Member;
let lmContext: StaffSessionContext;
let caContext: StaffSessionContext;
let firstTrackerId: string;
let secondTrackerId: string;
let originalEventIds: string[];
let takeoverEventIds: string[];
let restrictedAreaId: string;
let allowedAreaId: string;
const previousMfaBypass = process.env.VAYLET_LOCAL_DISABLE_MFA;

function readInput(actor: Member, context: StaffSessionContext) {
  return {
    context,
    limit: 21,
    scope: {
      organizationId: source.organizationId,
      locationId: source.locationId,
      membershipId: actor.membershipId,
    },
  };
}

const read = (actor: Member, context: StaffSessionContext) =>
  inPostgresTransaction(db.runtimePool, (tx) =>
    queryGeofenceViolationAlertCases(tx, readInput(actor, context)),
  );
const exact = (actor: Member, context: StaffSessionContext, sourceId: string) =>
  inPostgresTransaction(db.runtimePool, (tx) =>
    findGeofenceViolationAlertCaseById(tx, {
      ...readInput(actor, context),
      sourceId,
    }),
  );

async function sendRoute(
  userId: string,
  points: readonly { latitude: number; longitude: number }[],
  start: Date,
): Promise<void> {
  await ingest()({
    authenticatedUserId: userId,
    sessionId: source.sessionId,
    samples: points.map((point, index) => ({
      ...point,
      accuracyMeters: 8,
      clientSampleId: randomUUID(),
      capturedAt: new Date(start.getTime() + index * 1_000).toISOString(),
    })),
  });
}

async function trackerIdFor(assigneeId: string): Promise<string> {
  const rows = await db.adminPool.query<{ id: string }>(
    `SELECT id::text FROM task_tracking_sessions
     WHERE organization_id=$1 AND task_id=$2 AND assignee_membership_id=$3`,
    [source.organizationId, source.taskId, assigneeId],
  );
  expect(rows.rows).toHaveLength(1);
  return rows.rows[0]!.id;
}

async function violationIds(trackerId: string): Promise<string[]> {
  const rows = await db.adminPool.query<{ id: string }>(
    `SELECT id::text FROM geofence_events
     WHERE organization_id=$1 AND location_id=$2
       AND tracking_session_id=$3 AND event_type='VIOLATION'
     ORDER BY occurred_at,id`,
    [source.organizationId, source.locationId, trackerId],
  );
  return rows.rows.map((row) => row.id);
}

beforeAll(async () => {
  process.env.VAYLET_LOCAL_DISABLE_MFA = "false";
  await db.setup();
  source = await db.createStartParkingFixture({
    assignKey: false,
    role: "VALET_EMPLOYEE",
  });
  await db.adminPool.query(
    `UPDATE organizations SET tracking_enabled=TRUE WHERE id=$1`,
    [source.organizationId],
  );
  await db.adminPool.query(
    `UPDATE organization_subscriptions
     SET status='ACTIVE',dashboard_access_enabled=TRUE
     WHERE organization_id=$1`,
    [source.organizationId],
  );
  await db.start(source, { session: 1, task: 3 });
  const actors = await db.actors(source);
  admin = actors.admin;
  replacement = actors.replacement;
  lm = await db.addMember(source, "LOCATION_MANAGER", false);
  lmContext = await db.credential(lm.userId);
  caContext = await db.credential(admin.userId, true);
  restrictedAreaId = await seedIssue414GeofenceArea(
    db.adminPool,
    source.organizationId,
    source.locationId,
    "RESTRICTED",
  );
  allowedAreaId = await seedIssue414GeofenceArea(
    db.adminPool,
    source.organizationId,
    source.locationId,
    "PARKING",
  );
  firstTrackerId = await trackerIdFor(source.membershipId);

  // The real GPS writer accepts up to 5-minute-delayed captures while
  // requiring capturedAt >= tracked segment start. Simulate a long-lived
  // fixture segment; never fabricate geofence events themselves.
  await db.adminPool.query(
    `UPDATE task_tracking_sessions
     SET started_at=clock_timestamp()-INTERVAL '4 minutes' WHERE id=$1`,
    [firstTrackerId],
  );
  const clock = await db.adminPool.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  const delayed = new Date(clock.rows[0]!.now.getTime() - 60_000);
  const outside = { latitude: 33, longitude: 38 };
  const inside = { latitude: 31.5, longitude: 35.5 };
  await sendRoute(source.userId, [outside, inside, outside, inside], delayed);
  originalEventIds = await violationIds(firstTrackerId);
  expect(originalEventIds).toHaveLength(3);

  const request = await db.request(source, actors.initiator, replacement);
  const outcome = await takeover()(request);
  expect(outcome).toMatchObject({
    operationId: request.operationId,
    replayed: false,
  });
  secondTrackerId = await trackerIdFor(replacement.membershipId);
  expect(secondTrackerId).not.toBe(firstTrackerId);
  const secondClock = await db.adminPool.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  await sendRoute(
    replacement.userId,
    [outside, inside],
    new Date(secondClock.rows[0]!.now.getTime() + 200),
  );
  takeoverEventIds = await violationIds(secondTrackerId);
  expect(takeoverEventIds).toHaveLength(1);
}, 120_000);

afterAll(async () => {
  try {
    await db.teardown();
  } finally {
    if (previousMfaBypass === undefined)
      delete process.env.VAYLET_LOCAL_DISABLE_MFA;
    else process.env.VAYLET_LOCAL_DISABLE_MFA = previousMfaBypass;
  }
}, 120_000);

describe("Issue #414 ALT-09: committed real GPS and takeover", () => {
  it("reads both source subtypes, distinct re-entry, delayed clocks and B's new tracker", async () => {
    const results = await read(lm, lmContext);
    const ids = results.map((item) => item.sourceId);
    expect(ids).toEqual(
      expect.arrayContaining([...originalEventIds, ...takeoverEventIds]),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      results.filter((item) => item.subtype === "RESTRICTED_ENTRY"),
    ).toHaveLength(3);
    expect(
      results.filter((item) => item.subtype === "LEFT_ALLOWED_UNION"),
    ).toHaveLength(1);
    expect(results.some((item) => item.mapAreaId === restrictedAreaId)).toBe(
      true,
    );
    expect(results.some((item) => item.mapAreaId === allowedAreaId)).toBe(true);
    expect(
      results.find((item) => item.sourceId === takeoverEventIds[0])
        ?.trackingSessionId,
    ).toBe(secondTrackerId);
    const delayed = results.find(
      (item) => item.sourceId === originalEventIds[0],
    )!;
    expect(
      new Date(delayed.attentionAt).getTime() -
        new Date(delayed.capturedAt).getTime(),
    ).toBeGreaterThan(50_000);
    expect(JSON.stringify(results)).not.toMatch(
      /latitude|longitude|assignee|route/i,
    );
    expect(results.every((item) => item.sourceId === item.episodeId)).toBe(
      true,
    );
  });

  it("allows assured CA, but fails closed after expired MFA", async () => {
    expect(await read(admin, caContext)).toHaveLength(4);
    await db.adminPool.query(
      `UPDATE staff_auth_sessions
       SET mfa_authenticated_at=clock_timestamp()-INTERVAL '9 hours'
       WHERE id=$1`,
      [caContext.staffAuthSessionId],
    );
    await expect(read(admin, caContext)).rejects.toMatchObject({
      code: "MFA_STEP_UP_REQUIRED",
    });
    await db.adminPool.query(
      `UPDATE staff_auth_sessions
       SET mfa_authenticated_at=clock_timestamp(),
           last_admin_activity_at=clock_timestamp() WHERE id=$1`,
      [caContext.staffAuthSessionId],
    );
  });

  it("anti-joins this user's Seen before page LIMIT, but exact remains authorized", async () => {
    const chosen = originalEventIds[0]!;
    expect(await exact(lm, lmContext, chosen)).toMatchObject({
      sourceId: chosen,
    });
    await db.adminPool.query(
      `INSERT INTO management_alert_seen_receipts
        (organization_id,user_id,category,source_id,geofence_event_id)
       VALUES ($1,$2,'ALT-09',$3,$3)`,
      [source.organizationId, lm.userId, chosen],
    );
    expect(
      (await read(lm, lmContext)).map((item) => item.sourceId),
    ).not.toContain(chosen);
    expect(
      (await read(admin, caContext)).map((item) => item.sourceId),
    ).toContain(chosen);
    expect(await exact(lm, lmContext, chosen)).toMatchObject({
      sourceId: chosen,
    });
  });

  it("rejects foreign scope and disabled source policy before reading events", async () => {
    const foreign = await db.parking();
    await expect(
      inPostgresTransaction(db.runtimePool, (tx) =>
        queryGeofenceViolationAlertCases(tx, {
          ...readInput(lm, lmContext),
          scope: {
            organizationId: foreign.organizationId,
            locationId: foreign.locationId,
            membershipId: lm.membershipId,
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await db.adminPool.query(
      "UPDATE organizations SET tracking_enabled=FALSE WHERE id=$1",
      [source.organizationId],
    );
    await expect(read(lm, lmContext)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    await db.adminPool.query(
      "UPDATE organizations SET tracking_enabled=TRUE WHERE id=$1",
      [source.organizationId],
    );
  });

  it("denies removed exact LM grant instead of returning an empty list", async () => {
    await db.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND location_id=$2 AND membership_id=$3`,
      [source.organizationId, source.locationId, lm.membershipId],
    );
    await expect(read(lm, lmContext)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });
});
