import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";
import {
  analyticsSeedCashShift,
  analyticsSeedIncident,
  analyticsSeedPayment,
  analyticsSeedSession,
} from "./dashboard-analytics-seed";

const context = new DashboardApiTestContext("http");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

const PERIOD_QUERY = "from=2026-07-10&to=2026-07-11";

describe("VAL-009D analytics HTTP boundary", () => {
  it("composes all four routes with real manager authentication", async () => {
    const fixture = await context.managerFixture();
    await analyticsSeedSession(context, {
      state: "COMPLETED",
      completedAtIso: "2026-07-10T10:00:00Z",
    });
    const paidSession = await analyticsSeedSession(context, {
      state: "COMPLETED",
      completedAtIso: "2026-07-10T11:00:00Z",
    });
    await analyticsSeedPayment(context, {
      currency: "JOD",
      paidAtIso: "2026-07-10T12:00:00Z",
      sessionId: paidSession,
    });
    await analyticsSeedIncident(context, {
      createdAtIso: "2026-07-10T09:00:00Z",
    });
    await analyticsSeedCashShift(context, { endedAtIso: "2026-07-10T18:00:00Z" });
    const queueSession = await analyticsSeedSession(context, {
      state: "REQUESTED",
    });
    await context.seedRetrievalRequest({
      requestedAgoMinutes: 3,
      sessionId: queueSession,
      status: "OPEN",
    });
    const { authorization } = await context.authenticated(fixture);
    const base = `/v1/staff/dashboard/locations/${fixture.locationId}/analytics`;
    for (const route of ["operations", "financial", "incidents", "kpis"]) {
      const result = await context.request(
        "GET",
        `${base}/${route}?${PERIOD_QUERY}`,
        { authorization },
      );
      expect(result.status, route).toBe(200);
      expect(result.body).toMatchObject({
        from: "2026-07-10",
        timezone: "Asia/Amman",
        to: "2026-07-11",
      });
    }
    const operations = await context.request(
      "GET",
      `${base}/operations?${PERIOD_QUERY}`,
      { authorization },
    );
    expect(operations.body?.metrics).toBeDefined();
    expect(operations.body?.carsHandledPerDay).toHaveLength(2);
    const financial = await context.request(
      "GET",
      `${base}/financial?${PERIOD_QUERY}`,
      { authorization },
    );
    expect(financial.status).toBe(200);
    expect(financial.body).toMatchObject({
      currencies: [{ currency: "JOD" }],
    });
    const incidents = await context.request(
      "GET",
      `${base}/incidents?${PERIOD_QUERY}`,
      { authorization },
    );
    expect(incidents.body?.incidentCount).toBe(1);
    const kpis = await context.request(
      "GET",
      `${base}/kpis?${PERIOD_QUERY}`,
      { authorization },
    );
    expect(kpis.status).toBe(200);
    expect(kpis.body).toMatchObject({
      carsPerActiveEmployee: { denominator: 0, numerator: 2, value: null },
      keyExceptions: { count: 0 },
      slaCompliance: { denominator: 0, percentage: null },
    });
    const queue = await context.request("GET", `${base}/queue`, {
      authorization,
    });
    expect(queue.status).toBe(200);
    expect(queue.body?.depth).toBe(1);
  });

  it("rejects invalid periods with REQUEST_INVALID and no caller timezone", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const path = `/v1/staff/dashboard/locations/${fixture.locationId}/analytics/operations`;
    for (const query of [
      "",
      "from=2026-07-10",
      "to=2026-07-11",
      `from=2026-07-12&to=2026-07-01`,
      `from=2026-06-01&to=2026-07-02`,
      `from=not-a-date&to=2026-07-02`,
      `from=2026-07-10&to=2026-07-11&timezone=UTC`,
      `from=2026-07-10&to=2026-07-11&limit=5`,
    ]) {
      const suffix = query === "" ? "" : `?${query}`;
      const result = await context.request("GET", `${path}${suffix}`, {
        authorization,
      });
      expect(result.status, query || "(empty)").toBe(400);
      expect(result.body?.code).toBe("REQUEST_INVALID");
    }
  });

  it("buckets completed sessions by the Location timezone across a DST-period July", async () => {
    const fixture = await context.managerFixture();
    const berlin = await context.addLocation(fixture, { name: "Berlin site" });
    await context.adminPool.query(
      `UPDATE locations SET timezone = 'Europe/Berlin'
       WHERE id = $1`,
      [berlin],
    );
    // 2026-07-15T22:30Z is 2026-07-16 00:30 in Berlin (CEST, UTC+2 in July).
    const berlinSession = await analyticsSeedSession(context, {
      state: "COMPLETED",
      completedAtIso: "2026-07-15T22:30:00Z",
    });
    await context.adminPool.query(
      `UPDATE valet_sessions SET location_id = $2 WHERE id = $1`,
      [berlinSession, berlin],
    );
    void berlin;
    const berlinLocationId = (
      await context.adminPool.query<{ id: string }>(
        `SELECT id::text AS id FROM locations
         WHERE organization_id = $1 AND timezone = 'Europe/Berlin'`,
        [fixture.organizationId],
      )
    ).rows[0]!.id;
    const staff = await context.createStaff(fixture);
    await context.grantAccess(fixture, staff.membershipId, berlinLocationId);
    const login = await context.login(staff);
    expect(login.status).toBe(200);
    const authorization = `Bearer ${String(login.body?.accessToken)}`;
    const result = await context.request(
      "GET",
      `/v1/staff/dashboard/locations/${berlinLocationId}/analytics/operations?from=2026-07-15&to=2026-07-17`,
      { authorization },
    );
    expect(result.status).toBe(200);
    expect(result.body?.timezone).toBe("Europe/Berlin");
    expect(result.body?.carsHandledPerDay).toEqual([
      { date: "2026-07-15", handledCount: 0 },
      { date: "2026-07-16", handledCount: 1 },
      { date: "2026-07-17", handledCount: 0 },
    ]);
    const kpis = await context.request(
      "GET",
      `/v1/staff/dashboard/locations/${berlinLocationId}/analytics/kpis?from=2026-07-16&to=2026-07-16`,
      { authorization },
    );
    expect(kpis.status).toBe(200);
    expect(kpis.body).toMatchObject({
      carsPerActiveEmployee: { numerator: 1 },
      locationId: berlinLocationId,
      timezone: "Europe/Berlin",
    });
  });
});
