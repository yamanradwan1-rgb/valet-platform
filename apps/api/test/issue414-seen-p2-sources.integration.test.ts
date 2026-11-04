import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { markManagementAlertOccurrenceSeen } from "../src/modules/dashboard/management-alert-seen/management-alert-seen-command";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const db = new DashboardOverviewTestContext("414-seen-p2-receipts");
let scope: {
  readonly organizationId: string;
  readonly locationId: string;
  readonly membershipId: string;
  readonly userId: string;
};
let context: Awaited<ReturnType<typeof db.staffSessionContext>>;

beforeAll(async () => {
  await db.setup();
  scope = await db.managerFixture();
  context = await db.staffSessionContext(scope.userId);
  await db.adminPool.query(
    `UPDATE organizations SET tracking_enabled=TRUE WHERE id=$1`,
    [scope.organizationId],
  );
}, 120_000);
afterAll(() => db.teardown(), 120_000);

function seen(category: string, sourceId: string, episodeId = sourceId) {
  return markManagementAlertOccurrenceSeen(db.runtimePool, {
    context,
    locationId: scope.locationId,
    category,
    sourceId,
    episodeId,
  });
}

async function handoffEvent(
  sessionId: string,
  eventType: "HANDOFF_VERIFICATION_FAILED" | "HANDOFF_SUPERVISOR_OVERRIDE",
  terminalized: boolean,
) {
  const id = randomUUID();
  await db.adminPool.query(
    `INSERT INTO audit_events
       (id,organization_id,location_id,valet_session_id,actor_membership_id,
        actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
     VALUES ($1,$2,$3,$4,$5,'MEMBERSHIP',$6,'ValetSession',$4,$7::jsonb,clock_timestamp())`,
    [id, scope.organizationId, scope.locationId, sessionId,
      scope.membershipId, eventType,
      JSON.stringify({ terminalized, attempt: terminalized ? 5 : 1 }),
    ],
  );
  return id;
}

async function trackedViolation(ambiguous: boolean) {
  const sessionId = await db.seedSession({ state: "PARKING" });
  const taskId = await db.seedTask({
    sessionId, taskType: "PARKING", status: "IN_PROGRESS",
    assigneeMembershipId: scope.membershipId,
  });
  const trackerId = randomUUID();
  const areaId = randomUUID();
  await db.adminPool.query(
    `INSERT INTO location_map_areas
       (id, organization_id, location_id, purpose, code, label, active, updated_at)
     VALUES ($1,$2,$3,'RESTRICTED',$4,'Seen proof',true,clock_timestamp())`,
    [areaId, scope.organizationId, scope.locationId, randomUUID()],
  );
  await db.adminPool.query(
    `INSERT INTO task_tracking_sessions
       (id,organization_id,location_id,valet_session_id,task_id,
        assignee_membership_id,started_at)
     VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '5 minutes')`,
    [trackerId, scope.organizationId, scope.locationId, sessionId,
      taskId, scope.membershipId],
  );
  const captured = new Date(Date.now() - 60_000);
  const violationId = randomUUID();
  for (const kind of ["ENTERED", "VIOLATION", ...(ambiguous ? ["ENTERED"] : [])]) {
    await db.adminPool.query(
      `INSERT INTO geofence_events
         (id,organization_id,location_id,valet_session_id,task_id,
          tracking_session_id,map_area_id,event_type,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::geofence_event_type,$9)`,
      [kind === "VIOLATION" ? violationId : randomUUID(),
        scope.organizationId, scope.locationId, sessionId,
        taskId, trackerId, areaId, kind, captured],
    );
  }
  return violationId;
}

describe("Issue #414 DEC-110 ALT-07/09 exact Seen source proof (PG17)", () => {
  it("marks only terminal handoff event or independent override, not ordinary wrong code", async () => {
    const sessionId = await db.seedSession({ state: "HANDOFF_PENDING" });
    const wrong = await handoffEvent(sessionId, "HANDOFF_VERIFICATION_FAILED", false);
    const terminal = await handoffEvent(sessionId, "HANDOFF_VERIFICATION_FAILED", true);
    const override = await handoffEvent(sessionId, "HANDOFF_SUPERVISOR_OVERRIDE", false);
    await expect(seen("ALT-07", wrong)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    expect((await seen("ALT-07", terminal)).episodeId).toBe(terminal);
    expect((await seen("ALT-07", override)).episodeId).toBe(override);
    expect(await seen("ALT-07", terminal)).toMatchObject({ episodeId: terminal });
    await expect(seen("ALT-07", terminal, override)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });

  it("uses recorded-at clock and proven single companion for geofence, not GPS timestamp", async () => {
    const valid = await trackedViolation(false);
    const ambiguous = await trackedViolation(true);
    expect((await seen("ALT-09", valid)).episodeId).toBe(valid);
    await expect(seen("ALT-09", ambiguous)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
    const original = await db.adminPool.query<{ recordedAt: Date }>(
      `SELECT recorded_at AS "recordedAt" FROM geofence_events WHERE id=$1`,
      [valid],
    );
    expect(new Date(await seen("ALT-09", valid).then((r) => r.seenAt)).getTime())
      .toBeGreaterThanOrEqual(original.rows[0]!.recordedAt.getTime());
    await db.adminPool.query(
      `UPDATE organizations SET tracking_enabled=FALSE WHERE id=$1`,
      [scope.organizationId],
    );
    await expect(seen("ALT-09", valid)).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });
});
