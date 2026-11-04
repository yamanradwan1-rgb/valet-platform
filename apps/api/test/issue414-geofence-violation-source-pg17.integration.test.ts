import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inPostgresTransaction } from "../src/common/database/postgres-transaction";
import {
  findGeofenceViolationAlertCaseById,
  queryGeofenceViolationAlertCases,
} from "../src/modules/dashboard/management-alert-sources/geofence-violation-alert-reader";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

// Requires Prime-confirmed exclusive disposable PG17 fixture lease. NOT unit-only.
const db = new DashboardOverviewTestContext("414-p23-alt09-source");
let locationId: string;
let organizationId: string;
let membershipId: string;
let userId: string;
let context: Awaited<ReturnType<typeof db.staffSessionContext>>;
let firstEvent: string;
let repeatedEvent: string;
let secondTrackerEvent: string;
let ambiguousEvent: string;
let expiredEvent: string;

interface SourceSeed {
  readonly areaId: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly trackerId: string;
}

async function seedSource(input: {
  readonly assigneeId: string | null;
  readonly startedAgoMinutes: number;
  readonly endedAgoMinutes?: number;
  readonly taskId: string;
  readonly sessionId: string;
  readonly purpose: "RESTRICTED" | "PARKING";
}): Promise<SourceSeed> {
  const areaId = randomUUID();
  const trackerId = randomUUID();
  await db.adminPool.query(
    `INSERT INTO location_map_areas
       (id, organization_id, location_id, purpose, code, label, active,
        updated_at)
     VALUES ($1,$2,$3,$4,$5,'Synthetic alert source',true,clock_timestamp())`,
    [areaId, organizationId, locationId, input.purpose, randomUUID()],
  );
  await db.adminPool.query(
    `INSERT INTO task_tracking_sessions
       (id,organization_id,location_id,valet_session_id,task_id,
        assignee_membership_id,started_at,ended_at)
     VALUES ($1,$2,$3,$4,$5,$6,
       clock_timestamp()-$7::integer * INTERVAL '1 minute',
       CASE WHEN $8::integer IS NULL THEN NULL
         ELSE clock_timestamp()-$8::integer * INTERVAL '1 minute' END)`,
    [
      trackerId,
      organizationId,
      locationId,
      input.sessionId,
      input.taskId,
      input.assigneeId,
      input.startedAgoMinutes,
      input.endedAgoMinutes ?? null,
    ],
  );
  return {
    areaId,
    taskId: input.taskId,
    sessionId: input.sessionId,
    trackerId,
  };
}

async function insertCompanionedViolation(
  source: SourceSeed,
  input: {
    readonly minutesAgo: number;
    readonly subtype: "RESTRICTED_ENTRY" | "LEFT_ALLOWED_UNION";
    readonly recordedDaysAgo?: number;
    readonly recordedMinutesAgo?: number;
    readonly ambiguous?: boolean;
  },
): Promise<string> {
  const eventId = randomUUID();
  const companion = input.subtype === "RESTRICTED_ENTRY" ? "ENTERED" : "EXITED";
  const now = await db.adminPool.query<{ now: Date }>(
    "SELECT clock_timestamp() AS now",
  );
  const capturedAt = new Date(
    now.rows[0]!.now.getTime() - input.minutesAgo * 60_000,
  );
  const recordedAt = new Date(
    now.rows[0]!.now.getTime() -
      (input.recordedDaysAgo ?? 0) * 86_400_000 -
      (input.recordedMinutesAgo ?? 0) * 60_000,
  );
  const kinds = input.ambiguous
    ? [companion, "VIOLATION", companion]
    : [companion, "VIOLATION"];
  for (const kind of kinds) {
    await db.adminPool.query(
      `INSERT INTO geofence_events
         (id, organization_id, location_id, valet_session_id, task_id,
          tracking_session_id, map_area_id, event_type, occurred_at, recorded_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::geofence_event_type,$9,$10)`,
      [
        kind === "VIOLATION" ? eventId : randomUUID(),
        organizationId,
        locationId,
        source.sessionId,
        source.taskId,
        source.trackerId,
        source.areaId,
        kind,
        capturedAt,
        recordedAt,
      ],
    );
  }
  return eventId;
}

const read = () =>
  inPostgresTransaction(db.runtimePool, (tx) =>
    queryGeofenceViolationAlertCases(tx, {
      context,
      scope: { organizationId, locationId, membershipId },
      limit: 21,
    }),
  );

beforeAll(async () => {
  await db.setup();
  const fixture = await db.managerFixture();
  ({ organizationId, locationId, membershipId, userId } = fixture);
  context = await db.staffSessionContext(userId);
  await db.adminPool.query(
    "UPDATE organizations SET tracking_enabled=TRUE WHERE id=$1",
    [organizationId],
  );
  const sessionId = await db.seedSession({ state: "PARKING" });
  const taskId = await db.seedTask({
    sessionId,
    taskType: "PARKING",
    status: "IN_PROGRESS",
    assigneeMembershipId: membershipId,
  });
  const first = await seedSource({
    assigneeId: membershipId,
    startedAgoMinutes: 5,
    endedAgoMinutes: 3,
    taskId,
    sessionId,
    purpose: "RESTRICTED",
  });
  firstEvent = await insertCompanionedViolation(first, {
    minutesAgo: 4.8,
    recordedMinutesAgo: 3.8,
    subtype: "RESTRICTED_ENTRY",
  });
  repeatedEvent = await insertCompanionedViolation(first, {
    minutesAgo: 4.2,
    recordedMinutesAgo: 3.4,
    subtype: "RESTRICTED_ENTRY",
  });
  const secondAssignee = await db.createActor(fixture, "VALET_EMPLOYEE");
  const second = await seedSource({
    assigneeId: secondAssignee.membershipId,
    startedAgoMinutes: 2,
    taskId,
    sessionId,
    purpose: "PARKING",
  });
  secondTrackerEvent = await insertCompanionedViolation(second, {
    minutesAgo: 1.5,
    subtype: "LEFT_ALLOWED_UNION",
  });
  ambiguousEvent = await insertCompanionedViolation(second, {
    minutesAgo: 0.5,
    subtype: "LEFT_ALLOWED_UNION",
    ambiguous: true,
  });
  const expired = await seedSource({
    assigneeId: null,
    startedAgoMinutes: 10 * 24 * 60,
    endedAgoMinutes: 7 * 24 * 60,
    taskId,
    sessionId,
    purpose: "RESTRICTED",
  });
  expiredEvent = await insertCompanionedViolation(expired, {
    minutesAgo: 8 * 24 * 60,
    recordedDaysAgo: 8,
    subtype: "RESTRICTED_ENTRY",
  });
}, 120_000);

afterAll(() => db.teardown(), 120_000);

describe("ALT-09 source-backed PG17, no shared DB", () => {
  it("returns distinct committed repeats and takeover trackers, never owner or GPS", async () => {
    const result = await read();
    const ids = result.map((item) => item.sourceId);
    expect(ids).toEqual(
      expect.arrayContaining([firstEvent, repeatedEvent, secondTrackerEvent]),
    );
    expect(ids).not.toContain(ambiguousEvent);
    expect(ids).not.toContain(expiredEvent);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      result.find((item) => item.sourceId === secondTrackerEvent)?.subtype,
    ).toBe("LEFT_ALLOWED_UNION");
    expect(result.find((item) => item.sourceId === firstEvent)?.subtype).toBe(
      "RESTRICTED_ENTRY",
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/latitude|longitude|assignee|gps|route/i);
    expect(
      result.every(
        (item) =>
          new Date(item.capturedAt).getTime() <=
          new Date(item.attentionAt).getTime(),
      ),
    ).toBe(true);
  });

  it("uses source event identity for exact lookup, never ambiguous or foreign IDs", async () => {
    const exact = (sourceId: string) =>
      inPostgresTransaction(db.runtimePool, (tx) =>
        findGeofenceViolationAlertCaseById(tx, {
          context,
          scope: { organizationId, locationId, membershipId },
          sourceId,
        }),
      );
    expect(await exact(firstEvent)).toMatchObject({
      sourceId: firstEvent,
      episodeId: firstEvent,
    });
    expect(await exact(ambiguousEvent)).toBeNull();
    expect(await exact(expiredEvent)).toBeNull();
    expect(await exact(randomUUID())).toBeNull();
  });

  it("denies after exact LM grant revocation instead of returning zero", async () => {
    await db.adminPool.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND location_id=$2 AND membership_id=$3`,
      [organizationId, locationId, membershipId],
    );
    await expect(read()).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });
});
