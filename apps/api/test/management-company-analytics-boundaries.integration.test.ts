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

async function scenario() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, { name: "BE-11 boundaries" });
  const amman = await fixture.addLocation(membership.organizationId, { name: "Amman" });
  const newYork = await fixture.addLocation(membership.organizationId, {
    name: "New York historical",
    status: "INACTIVE",
  });
  await fixture.query(`UPDATE locations SET timezone='America/New_York' WHERE id=$1`, [
    newYork.locationId,
  ]);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  const scope = (locationId: string): CompanySeedScope => ({
    locationId,
    membershipId: membership.membershipId,
    organizationId: membership.organizationId,
  });
  return { amman: scope(amman.locationId), auth, membership, newYork: scope(newYork.locationId) };
}

describe("MGT-BE-11 company timezone and historical Location boundaries", () => {
  it("uses each persisted timezone across DST and includes inactive Location history", async () => {
    const state = shared;
    await seedCompanySession(fixture, state.amman, {
      completedAt: "2026-03-07T21:00:00Z",
      createdAt: "2026-03-07T20:55:00Z",
      state: "COMPLETED",
    });
    await seedCompanySession(fixture, state.newYork, {
      completedAt: "2026-03-08T04:59:59Z",
      createdAt: "2026-03-08T04:55:00Z",
      state: "COMPLETED",
    });
    const firstIncluded = await seedCompanySession(fixture, state.newYork, {
      completedAt: "2026-03-08T05:00:00Z",
      createdAt: "2026-03-08T05:00:00Z",
      state: "COMPLETED",
    });
    await seedCompanyIncident(fixture, state.newYork, {
      createdAt: "2026-03-08T06:00:00Z",
      sessionId: firstIncluded,
      type: "KEY_MISSING",
    });
    await seedCompanySession(fixture, state.newYork, {
      completedAt: "2026-03-09T03:59:59Z",
      createdAt: "2026-03-09T03:55:00Z",
      state: "COMPLETED",
    });
    await seedCompanySession(fixture, state.newYork, {
      checkingInCompletedAt: "2026-03-08T06:30:00Z",
      createdAt: "2026-03-08T06:30:00Z",
      state: "CHECKING_IN",
    });

    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-03-08&to=2026-03-08`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.summary).toMatchObject({
      coverage: {
        activeLocationCount: 1,
        inactiveLocationCount: 1,
        timezoneBoundaries: [
          {
            activeLocationCount: 0,
            inactiveLocationCount: 1,
            locationCount: 1,
            periodEndUtc: "2026-03-09T04:00:00.000Z",
            periodStartUtc: "2026-03-08T05:00:00.000Z",
            timezone: "America/New_York",
          },
          {
            activeLocationCount: 1,
            inactiveLocationCount: 0,
            locationCount: 1,
            periodEndUtc: "2026-03-08T21:00:00.000Z",
            periodStartUtc: "2026-03-07T21:00:00.000Z",
            timezone: "Asia/Amman",
          },
        ],
        totalLocationCount: 2,
      },
      incidents: { incidentCount: 1 },
      operational: {
        carsHandledPerDay: [{ date: "2026-03-08", handledCount: 3 }],
        metrics: {
          checkInTime: {
            averageSeconds: "0.000",
            contributingLocationCount: 1,
            sampleCount: 1,
          },
        },
      },
    });
  });

  it("keeps missing samples null while measured empty counts stay zero", async () => {
    const state = shared;
    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-03-10&to=2026-03-10`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.summary).toMatchObject({
      incidents: {
        incidentCount: 0,
        incidentsPer1000: { denominator: 0, numerator: 0, value: null },
      },
      kpis: {
        carsPerActiveEmployee: { denominator: 0, numerator: 0, value: null },
        slaCompliance: { denominator: 0, percentage: null, requestCount: 0 },
      },
      operational: {
        carsHandledPerDay: [{ date: "2026-03-10", handledCount: 0 }],
        metrics: { checkInTime: { averageSeconds: null, sampleCount: 0 } },
      },
    });
  });

  it("uses the 25-hour America/New_York fall-back local day", async () => {
    const state = shared;
    for (const [completedAt, createdAt] of [
      ["2026-11-01T03:59:59Z", "2026-11-01T03:55:00Z"],
      ["2026-11-01T04:00:00Z", "2026-11-01T03:56:00Z"],
      ["2026-11-02T04:59:59Z", "2026-11-02T04:55:00Z"],
      ["2026-11-02T05:00:00Z", "2026-11-02T04:56:00Z"],
    ] as const) {
      await seedCompanySession(fixture, state.newYork, {
        completedAt,
        createdAt,
        state: "COMPLETED",
      });
    }

    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-11-01&to=2026-11-01`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    const summary = (response.body as unknown as CompanyAnalyticsResponse).summary;
    const newYork = summary.coverage.timezoneBoundaries.find(
      (entry: { timezone: string }) => entry.timezone === "America/New_York",
    );
    expect(newYork).toMatchObject({
      periodEndUtc: "2026-11-02T05:00:00.000Z",
      periodStartUtc: "2026-11-01T04:00:00.000Z",
    });
    expect(summary.operational.carsHandledPerDay).toEqual([
      { date: "2026-11-01", handledCount: 2 },
    ]);
  });

  it("counts a missing SLA target request but excludes it from the denominator", async () => {
    const state = shared;
    const requestedAt = "2026-08-01T10:00:00Z";
    const sessionId = await seedCompanySession(fixture, state.amman, {
      createdAt: "2026-08-01T09:55:00Z",
      readyAt: "2026-08-01T10:01:00Z",
      retrievalRequestedAt: requestedAt,
      state: "READY",
    });
    await seedCompanyRetrievalRequest(fixture, state.amman, {
      requestedAt,
      sessionId,
      targetSeconds: null,
    });
    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${state.membership.organizationId}/analytics/all-locations?from=2026-08-01&to=2026-08-01`,
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.summary).toMatchObject({
      kpis: {
        slaCompliance: {
          denominator: 0,
          invalidOrMissingIntervalCount: 0,
          missingTargetCount: 1,
          numerator: 0,
          percentage: null,
          requestCount: 1,
        },
      },
    });
  });
});
