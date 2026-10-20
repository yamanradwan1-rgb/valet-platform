import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { locationKpiAnalytics } from "../src/modules/dashboard/analytics-kpi-query";
import { analyticsSeedSession } from "./dashboard-analytics-seed";
import { DashboardOverviewTestContext } from "./dashboard-overview-test-context";

const context = new DashboardOverviewTestContext("analytics-kpis");
const period = { from: "2026-07-10", to: "2026-07-10" };
const inPeriod = "2026-07-10T10:00:00Z";
const outside = "2026-07-01T10:00:00Z";

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 120_000);

async function actor() {
  return context.createActor(await context.managerFixture(), "VALET_EMPLOYEE", { access: false });
}

async function slaSample(input: {
  readyAt: string | null;
  requestedAt: string;
  target: number | null;
}) {
  const fixture = await context.managerFixture();
  await context.adminPool.query(
    `UPDATE locations SET sla_target_seconds=$2 WHERE id=$1`,
    [fixture.locationId, input.target],
  );
  const sessionId = await analyticsSeedSession(context, {
    createdAtIso: outside,
    readyAtIso: input.readyAt,
    retrievalRequestedAtIso: input.requestedAt,
    state: "READY",
  });
  await context.adminPool.query(
    `INSERT INTO retrieval_requests
       (id,organization_id,valet_session_id,requested_by_type,status,requested_at)
     VALUES($1,$2,$3,'CUSTOMER','OPEN',$4::timestamptz)`,
    [randomUUID(), fixture.organizationId, sessionId, input.requestedAt],
  );
}

async function seedWorkEvidence() {
  const fixture = await context.managerFixture();
  const members = await Promise.all(Array.from({ length: 9 }, () => actor()));
  await analyticsSeedSession(context, {
    createdAtIso: inPeriod, state: "PARKED",
    checkedInByMembershipId: members[0]!.membershipId,
  });
  const condition = await analyticsSeedSession(context, { createdAtIso: outside, state: "PARKED" });
  await context.adminPool.query(
    `UPDATE valet_sessions
     SET check_in_condition_completed_by_membership_id=$2,
         check_in_condition_completed_at=$3::timestamptz WHERE id=$1`,
    [condition, members[1]!.membershipId, inPeriod],
  );
  const completed = await analyticsSeedSession(context, {
    completedAtIso: "2026-07-10T11:00:00Z", createdAtIso: outside, state: "COMPLETED",
  });
  await context.adminPool.query(
    `UPDATE valet_sessions SET completed_by_membership_id=$2 WHERE id=$1`,
    [completed, members[2]!.membershipId],
  );
  await analyticsSeedSession(context, {
    completedAtIso: "2026-07-10T12:00:00Z", createdAtIso: outside, state: "COMPLETED",
  });
  const generic = await analyticsSeedSession(context, { createdAtIso: outside, state: "PARKED" });
  await context.adminPool.query(
    `INSERT INTO key_custody_events
       (id,organization_id,location_id,valet_session_id,key_slot_id,actor_membership_id,event_type,occurred_at)
     VALUES($1,$2,$3,$4,NULL,$5,'RELEASED',$6::timestamptz)`,
    [randomUUID(), fixture.organizationId, fixture.locationId, generic, members[3]!.membershipId, inPeriod],
  );
  await context.adminPool.query(
    `INSERT INTO condition_notes
       (id,organization_id,location_id,valet_session_id,context,content,recorded_by_membership_id,created_at)
     VALUES($1,$2,$3,$4,'CHECK_IN','note',$5,$6::timestamptz)`,
    [randomUUID(), fixture.organizationId, fixture.locationId, generic, members[4]!.membershipId, inPeriod],
  );
  await context.adminPool.query(
    `INSERT INTO vehicle_photos
       (id,organization_id,location_id,valet_session_id,captured_by_membership_id,purpose,
        storage_object_key,content_type,created_at)
     VALUES($1,$2,$3,$4,$5,'CHECK_IN_CONDITION',$6,'image/jpeg',$7::timestamptz)`,
    [randomUUID(), fixture.organizationId, fixture.locationId, generic,
      members[5]!.membershipId, `kpi/${randomUUID()}`, inPeriod],
  );
  await context.adminPool.query(
    `INSERT INTO handoff_verifications
       (id,organization_id,valet_session_id,method,max_attempts,verified_at,
        verified_by_membership_id,override_reason)
     VALUES($1,$2,$3,'SUPERVISOR_OVERRIDE',1,$4::timestamptz,$5,'test override')`,
    [randomUUID(), fixture.organizationId, generic, inPeriod, members[6]!.membershipId],
  );
  const task = randomUUID();
  await context.adminPool.query(
    `INSERT INTO tasks
       (id,organization_id,location_id,valet_session_id,task_type,status,
        current_assignee_membership_id,updated_at)
     VALUES($1,$2,$3,$4,'RETRIEVAL','ASSIGNED',$5,clock_timestamp())`,
    [task, fixture.organizationId, fixture.locationId, generic, members[8]!.membershipId],
  );
  for (const [type, performer] of [
    ["ACCEPTED", members[7]!.membershipId], ["ASSIGNED", members[8]!.membershipId],
  ] as const) {
    await context.adminPool.query(
      `INSERT INTO dispatch_events
         (id,organization_id,location_id,task_id,valet_session_id,event_type,
          actor_membership_id,new_assignee_membership_id,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8::timestamptz)`,
      [randomUUID(), fixture.organizationId, fixture.locationId, task, generic, type, performer, inPeriod],
    );
  }
  await context.adminPool.query(
    `UPDATE organization_memberships SET role='ORG_ADMIN',status='INACTIVE'
     WHERE id=$1`, [members[3]!.membershipId],
  );
  return { generic, members };
}

async function seedIncidents(sessionId: string) {
  const fixture = await context.managerFixture();
  for (const type of ["KEY_MISSING", "WRONG_KEY", "KEY_DAMAGED", "KEY_LOCKED_INSIDE", "OTHER"]) {
    await context.adminPool.query(
      `INSERT INTO incidents
         (id,organization_id,location_id,valet_session_id,status,severity,type,
          description,reported_by_membership_id,created_at)
       VALUES($1,$2,$3,$4,'OPEN','LOW',$5,'kpi',$6,$7::timestamptz)`,
      [randomUUID(), fixture.organizationId, fixture.locationId, sessionId, type,
        fixture.membershipId, inPeriod],
    );
  }
}

describe("MGT-BE-10 KPI source contracts", () => {
  it("uses exact historical SLA coverage, approved work evidence, handoff actor and key catalog", async () => {
    const fixture = await context.managerFixture();
    await slaSample({ requestedAt: "2026-07-10T08:00:00Z", readyAt: "2026-07-10T08:05:00Z", target: 300 });
    await slaSample({ requestedAt: "2026-07-10T09:00:00Z", readyAt: "2026-07-10T09:06:00Z", target: 300 });
    await slaSample({ requestedAt: "2026-07-10T13:00:00Z", readyAt: "2026-07-10T13:01:00Z", target: null });
    await slaSample({ requestedAt: "2026-07-10T14:00:00Z", readyAt: null, target: 300 });
    const work = await seedWorkEvidence();
    await seedIncidents(work.generic);
    const otherLocation = await context.addLocation(fixture);
    const otherSession = await analyticsSeedSession(context, {
      completedAtIso: "2026-07-10T15:00:00Z", createdAtIso: outside,
      locationId: otherLocation, state: "COMPLETED",
    });
    await context.adminPool.query(
      `INSERT INTO incidents
         (id,organization_id,location_id,valet_session_id,status,severity,type,
          description,reported_by_membership_id,created_at)
       VALUES($1,$2,$3,$4,'OPEN','LOW','KEY_MISSING','foreign',$5,$6::timestamptz)`,
      [randomUUID(), fixture.organizationId, otherLocation, otherSession,
        fixture.membershipId, inPeriod],
    );
    const response = await locationKpiAnalytics(context.runtimePool, {
      authenticatedUserId: fixture.userId,
      locationId: fixture.locationId,
      period,
      recordManagementActivity: false,
    });
    expect(response.slaCompliance).toEqual({
      denominator: 2, invalidOrMissingIntervalCount: 1, missingTargetCount: 1,
      numerator: 1, percentage: "50.00",
    });
    expect(response.carsPerActiveEmployee).toEqual({ denominator: 8, numerator: 2, value: "0.250" });
    expect(response.carsHandedOffByEmployee).toEqual({
      attributedCount: 1,
      byEmployee: [{ count: 1, membershipId: work.members[2]!.membershipId }],
      employeeCount: 1,
      missingAttributionCount: 1,
      truncated: false,
    });
    expect(response.keyExceptions).toEqual({
      count: 4,
      byType: [
        { count: 1, type: "KEY_MISSING" }, { count: 1, type: "WRONG_KEY" },
        { count: 1, type: "KEY_DAMAGED" }, { count: 1, type: "KEY_LOCKED_INSIDE" },
      ],
    });
  });

  it("returns explicit null ratios for a scoped empty period", async () => {
    const fixture = await context.managerFixture();
    const response = await locationKpiAnalytics(context.runtimePool, {
      authenticatedUserId: fixture.userId, locationId: fixture.locationId,
      period: { from: "2026-08-10", to: "2026-08-10" }, recordManagementActivity: false,
    });
    expect(response.slaCompliance.percentage).toBeNull();
    expect(response.slaCompliance.denominator).toBe(0);
    expect(response.carsPerActiveEmployee).toEqual({ denominator: 0, numerator: 0, value: null });
    expect(response.keyExceptions.count).toBe(0);
  });
});
