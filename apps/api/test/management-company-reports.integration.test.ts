import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  seedCompanyRetrievalRequest,
  seedCompanySession,
  type CompanySeedScope,
} from "./management-company-analytics-test-seed";

const fixture = new ManagementControlPlaneTestFixture();
let shared: Awaited<ReturnType<typeof scenario>>;

beforeAll(async () => {
  await fixture.start();
  shared = await scenario();
}, 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function scenario() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name: "BE-11 reports" });
  const active = await fixture.addLocation(membership.organizationId, { name: "Active" });
  const inactive = await fixture.addLocation(membership.organizationId, {
    name: "Inactive history",
    status: "INACTIVE",
  });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  const scope = (locationId: string): CompanySeedScope => ({
    locationId,
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
  });
  return { active: scope(active.locationId), auth, inactive: scope(inactive.locationId), membership };
}

async function dailySource(scope: CompanySeedScope, hour: number) {
  const requestedAt = `2026-07-10T${String(hour).padStart(2, "0")}:00:00Z`;
  const sessionId = await seedCompanySession(fixture, scope, {
    completedAt: `2026-07-10T${String(hour).padStart(2, "0")}:10:00Z`,
    createdAt: `2026-07-10T${String(hour - 1).padStart(2, "0")}:50:00Z`,
    readyAt: `2026-07-10T${String(hour).padStart(2, "0")}:05:00Z`,
    retrievalRequestedAt: requestedAt,
    state: "COMPLETED",
  });
  await seedCompanyRetrievalRequest(fixture, scope, {
    requestedAt,
    sessionId,
    targetSeconds: 600,
  });
  return sessionId;
}

async function dispatch(scope: CompanySeedScope, sessionId: string, taskType: "PARKING" | "RETRIEVAL") {
  const taskId = randomUUID();
  await fixture.query(
    `INSERT INTO tasks
       (id,organization_id,location_id,valet_session_id,task_type,status,
        current_assignee_membership_id,updated_at)
     VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,transaction_timestamp())`,
    [taskId, scope.organizationId, scope.locationId, sessionId, taskType, scope.membershipId],
  );
  await fixture.query(
    `INSERT INTO dispatch_events
       (id,organization_id,location_id,task_id,valet_session_id,event_type,
        actor_membership_id,new_assignee_membership_id,occurred_at,created_at)
     VALUES($1,$2,$3,$4,$5,'ASSIGNED',$6,$6,'2026-07-10T12:00:00Z',transaction_timestamp())`,
    [randomUUID(), scope.organizationId, scope.locationId, taskId, sessionId, scope.membershipId],
  );
}

async function custody(scope: CompanySeedScope, sessionId: string) {
  await fixture.query(
    `INSERT INTO key_custody_events
       (id,organization_id,location_id,valet_session_id,key_slot_id,
        actor_membership_id,event_type,occurred_at,created_at)
     VALUES($1,$2,$3,$4,NULL,$5,'RELEASED','2026-07-10T12:30:00Z',transaction_timestamp())`,
    [randomUUID(), scope.organizationId, scope.locationId, sessionId, scope.membershipId],
  );
}

describe("MGT-BE-11 company report HTTP reads", () => {
  it("composes daily activity and analytics from active and inactive Locations in one report", async () => {
    const state = shared;
    const [activeSession, inactiveSession] = await Promise.all([
      dailySource(state.active, 9),
      dailySource(state.inactive, 11),
    ]);
    await Promise.all([
      dispatch(state.active, activeSession, "RETRIEVAL"),
      dispatch(state.inactive, inactiveSession, "PARKING"),
      custody(state.active, activeSession),
      custody(state.inactive, inactiveSession),
    ]);

    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/reports/daily?date=2026-07-10`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.body).toMatchObject({
      dailyActivity: {
        dispatchEventCounts: [
          { count: 1, eventType: "ASSIGNED", taskType: "PARKING" },
          { count: 1, eventType: "ASSIGNED", taskType: "RETRIEVAL" },
        ],
        keyCustodyEventCounts: [{ count: 2, eventType: "RELEASED" }],
        retrievalRequestedCount: 2,
      },
      kind: "DAILY",
      organizationId: state.membership.organizationId,
      periodFrom: "2026-07-10",
      periodTo: "2026-07-10",
      summary: {
        coverage: { activeLocationCount: 1, inactiveLocationCount: 1, totalLocationCount: 2 },
        kpis: { slaCompliance: { denominator: 2, numerator: 2, requestCount: 2 } },
        operational: { carsHandledPerDay: [{ date: "2026-07-10", handledCount: 2 }] },
      },
    });
  });

  it("resolves weekly/monthly periods and never fabricates daily activity", async () => {
    const state = shared;
    const base = `/v1/staff/management/organizations/${state.membership.organizationId}/reports`;
    const weekly = await fixture.managementGet(
      `${base}/weekly?weekStart=2026-07-06`,
      state.auth.accessToken,
    );
    expect(weekly.status).toBe(200);
    expect(weekly.body).toMatchObject({ kind: "WEEKLY", periodFrom: "2026-07-06", periodTo: "2026-07-12" });
    expect("dailyActivity" in (weekly.body ?? {})).toBe(false);

    const monthly = await fixture.managementGet(`${base}/monthly?month=2026-07`, state.auth.accessToken);
    expect(monthly.status).toBe(200);
    expect(monthly.body).toMatchObject({ kind: "MONTHLY", periodFrom: "2026-07-01", periodTo: "2026-07-31" });
    expect("dailyActivity" in (monthly.body ?? {})).toBe(false);

    const leap = await fixture.managementGet(`${base}/monthly?month=2028-02`, state.auth.accessToken);
    expect(leap.status).toBe(200);
    expect(leap.body).toMatchObject({
      kind: "MONTHLY",
      periodFrom: "2028-02-01",
      periodTo: "2028-02-29",
    });

    for (const path of [
      `${base}/weekly?weekStart=2026-07-07`,
      `${base}/monthly?month=2026-13`,
      `${base}/daily?date=2026-07-10&timezone=UTC`,
    ]) {
      const invalid = await fixture.managementGet(path, state.auth.accessToken);
      expect(invalid.status, path).toBe(400);
      expect(invalid.body, path).toMatchObject({ code: "REQUEST_INVALID" });
    }
  });
});
