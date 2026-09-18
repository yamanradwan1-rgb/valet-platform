import { randomUUID } from "node:crypto";

import type { CompanyAnalyticsResponse } from "@valet/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";
import {
  seedCompanyIncident,
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

function at(start: string, seconds: number): string {
  return new Date(new Date(start).getTime() + seconds * 1000).toISOString();
}

async function unhashedEmployee(organizationId: string): Promise<string> {
  const userId = randomUUID();
  const membershipId = randomUUID();
  await fixture.query(
    `WITH inserted_user AS (
       INSERT INTO users(id,email,password_hash,status,updated_at)
       VALUES($1,$2,'not-real','ACTIVE',transaction_timestamp()) RETURNING id
     )
     INSERT INTO organization_memberships
       (id,organization_id,user_id,role,status,updated_at)
     SELECT $3,$4,id,'VALET_EMPLOYEE','ACTIVE',transaction_timestamp()
     FROM inserted_user`,
    [userId, `${userId}@be11-weight.test`, membershipId, organizationId],
  );
  return membershipId;
}

async function scenario() {
  const admin = await fixture.createUser();
  const membership = await fixture.createMembership(admin.id, { name: "BE-11 weighting" });
  const first = await fixture.addLocation(membership.organizationId, { name: "First" });
  const second = await fixture.addLocation(membership.organizationId, { name: "Second" });
  const [
    workerMembershipId,
    directoryOnlyMembershipId,
    shiftOnlyMembershipId,
    taskOnlyMembershipId,
  ] = await Promise.all([
    unhashedEmployee(membership.organizationId),
    unhashedEmployee(membership.organizationId),
    unhashedEmployee(membership.organizationId),
    unhashedEmployee(membership.organizationId),
  ] as const);
  const auth = await fixture.nativeLogin(admin);
  await fixture.enrollAndAssure(auth);
  const scope = (locationId: string): CompanySeedScope => ({
    locationId,
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
  });
  return {
    auth,
    directoryOnlyMembershipId,
    first: scope(first.locationId),
    membership,
    second: scope(second.locationId),
    shiftOnlyMembershipId,
    taskOnlyMembershipId,
    workerMembershipId,
  };
}

async function durationAndSlaSample(
  scope: CompanySeedScope,
  workerMembershipId: string,
  start: string,
  seconds: number,
) {
  const checkingInCompletedAt = at(start, seconds);
  const parkingStartedAt = at(start, seconds + 10);
  const parkedAt = at(start, 2 * seconds + 10);
  const retrievalRequestedAt = at(start, 2 * seconds + 20);
  const retrievalStartedAt = at(start, 3 * seconds + 20);
  const readyAt = retrievalStartedAt;
  const completedAt = at(start, 4 * seconds + 20);
  const sessionId = await seedCompanySession(fixture, scope, {
    checkedInByMembershipId: workerMembershipId,
    checkingInCompletedAt,
    completedAt,
    completedByMembershipId: workerMembershipId,
    createdAt: start,
    parkedAt,
    parkingStartedAt,
    readyAt,
    retrievalRequestedAt,
    retrievalStartedAt,
    state: "COMPLETED",
  });
  await seedCompanyRetrievalRequest(fixture, scope, {
    requestedAt: retrievalRequestedAt,
    sessionId,
    targetSeconds: 50,
  });
  return sessionId;
}

describe("MGT-BE-11 company analytics source weighting", () => {
  it("recomputes all duration metrics and ratios from unequal source samples", async () => {
    const state = shared;
    const [firstSession] = await Promise.all([
      durationAndSlaSample(
        state.first,
        state.workerMembershipId,
        "2026-07-10T08:00:00Z",
        10,
      ),
      ...[10, 12, 14].map((hour) =>
        durationAndSlaSample(
          state.second,
          state.workerMembershipId,
          `2026-07-10T${hour}:00:00Z`,
          100,
        ),
      ),
    ]);
    await seedCompanyIncident(fixture, state.first, {
      createdAt: "2026-07-10T09:00:00Z",
      sessionId: firstSession,
      type: "KEY_MISSING",
    });

    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-07-10&to=2026-07-10`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    const summary = (response.body as unknown as CompanyAnalyticsResponse).summary;
    for (const metric of [
      "checkInTime",
      "parkingTime",
      "retrievalWait",
      "retrievalStartLatencyAuxiliary",
      "handoffTime",
    ] as const) {
      expect(summary.operational.metrics[metric], metric).toEqual({
        averageSeconds: "77.500",
        contributingLocationCount: 2,
        sampleCount: 4,
      });
    }
    expect(summary.kpis.slaCompliance).toMatchObject({
      denominator: 4,
      numerator: 1,
      percentage: "25.00",
      requestCount: 4,
    });
    expect(summary.incidents.incidentsPer1000).toEqual({
      denominator: 4,
      numerator: 1,
      value: "250.000",
    });
  });

  it("uses Organization DISTINCT approved work evidence and ignores directory/Shift/task-only rows", async () => {
    const state = shared;
    const [firstSession] = await Promise.all([
      durationAndSlaSample(
        state.first,
        state.workerMembershipId,
        "2026-07-11T08:00:00Z",
        10,
      ),
      durationAndSlaSample(
        state.second,
        state.workerMembershipId,
        "2026-07-11T10:00:00Z",
        10,
      ),
    ]);
    void state.directoryOnlyMembershipId;
    await fixture.query(
      `INSERT INTO shifts
         (id,organization_id,location_id,membership_id,status,started_at,ended_at)
       VALUES($1,$2,$3,$4,'ENDED',$5::timestamptz,$6::timestamptz)`,
      [
        randomUUID(),
        state.membership.organizationId,
        state.first.locationId,
        state.shiftOnlyMembershipId,
        "2026-07-11T07:00:00Z",
        "2026-07-11T08:00:00Z",
      ],
    );
    await fixture.query(
      `INSERT INTO tasks
         (id,organization_id,location_id,valet_session_id,task_type,status,
          current_assignee_membership_id,updated_at)
       VALUES($1,$2,$3,$4,'RETRIEVAL','ASSIGNED',$5,transaction_timestamp())`,
      [
        randomUUID(),
        state.membership.organizationId,
        state.first.locationId,
        firstSession,
        state.taskOnlyMembershipId,
      ],
    );
    await fixture.query(
      `UPDATE organization_memberships SET role='ORG_ADMIN',status='INACTIVE'
       WHERE id=$1`,
      [state.workerMembershipId],
    );

    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-07-11&to=2026-07-11`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.summary).toMatchObject({
      kpis: {
        carsHandedOff: {
          attributedCount: 2,
          distinctAttributedEmployeeCount: 1,
          missingAttributionCount: 0,
        },
        carsPerActiveEmployee: {
          denominator: 1,
          evidenceLocationCount: 2,
          numerator: 2,
          value: "2.000",
        },
      },
    });
  });

  it("counts two distinct approved workers in one Location exactly once each", async () => {
    const state = shared;
    const [firstWorker, secondWorker] = await Promise.all([
      unhashedEmployee(state.membership.organizationId),
      unhashedEmployee(state.membership.organizationId),
    ]);
    await Promise.all(
      [firstWorker, secondWorker].map((membershipId, index) =>
        seedCompanySession(fixture, state.first, {
          checkedInByMembershipId: membershipId,
          completedAt: `2026-07-12T1${index}:10:00Z`,
          completedByMembershipId: membershipId,
          createdAt: `2026-07-12T1${index}:00:00Z`,
          state: "COMPLETED",
        }),
      ),
    );
    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-07-12&to=2026-07-12`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.summary).toMatchObject({
      kpis: {
        carsHandedOff: { attributedCount: 2, distinctAttributedEmployeeCount: 2 },
        carsPerActiveEmployee: {
          denominator: 2,
          evidenceLocationCount: 1,
          numerator: 2,
          value: "1.000",
        },
      },
    });
  });
});
