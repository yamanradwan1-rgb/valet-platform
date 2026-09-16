import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";

class DashboardOverviewApiTestContext extends DashboardApiTestContext {
  async seedOverviewData(): Promise<string> {
    const fixture = await this.managerFixture();
    const slotId = await this.seedKeySlot(randomUUID().slice(0, 8));
    const sessionId = await this.seedSession({
      keySlotId: slotId,
      state: "RETRIEVING",
    });
    await this.seedRetrievalRequest({
      requestedAgoMinutes: 5,
      sessionId,
      status: "OPEN",
    });
    await this.seedTask({
      assigneeMembershipId: fixture.membershipId,
      sessionId,
      status: "ASSIGNED",
      taskType: "RETRIEVAL",
    });
    await this.seedIncident({ sessionId, status: "OPEN" });
    await this.seedPayment({ currency: "JOD", sessionId });
    try {
      await this.startActiveShift(fixture, {
        membershipId: fixture.membershipId,
        userId: fixture.userId,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
    }
    return fixture.locationId;
  }

  async staffBearer(
    role: "ORG_ADMIN" | "VALET_SUPERVISOR" | "VALET_EMPLOYEE",
    withShift = false,
  ): Promise<string> {
    const fixture = await this.managerFixture();
    const staff = await this.createStaff(fixture, role);
    if (withShift) {
      await this.startActiveShift(fixture, {
        membershipId: staff.membershipId,
        userId: staff.userId,
      });
    }
    const login = await this.login(staff);
    expect(login.status).toBe(200);
    return `Bearer ${String(login.body?.accessToken)}`;
  }
}

const context = new DashboardOverviewApiTestContext("http");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

describe("VAL-009C overview HTTP boundary", () => {
  it("composes all eight overview routes with real manager authentication", async () => {
    const locationId = await context.seedOverviewData();
    const { authorization, login } = await context.authenticated(
      await context.managerFixture(),
    );
    expect(login.status).toBe(200);
    const base = `/v1/staff/dashboard/locations/${locationId}/overview`;
    const expectations: Array<
      [string, (body: Record<string, unknown>) => void]
    > = [
      ["sessions", (body) => expect(body.items).toHaveLength(1)],
      ["session-state-counts", (body) => expect(body.counts).toHaveLength(9)],
      ["retrieval-queue", (body) => expect(body.items).toHaveLength(1)],
      ["tasks", (body) => expect(body.items).toHaveLength(1)],
      ["active-shifts", (body) => expect(body.items).toHaveLength(1)],
      ["keys", (body) => expect(body.items).toHaveLength(1)],
      ["incidents", (body) => expect(body.items).toHaveLength(1)],
      [
        "financial",
        (body) =>
          expect(body).toMatchObject({
            currencies: [{ currency: "JOD" }],
          }),
      ],
    ];
    for (const [route, assert] of expectations) {
      const result = await context.request("GET", `${base}/${route}`, {
        authorization,
      });
      expect(result.status, route).toBe(200);
      assert(result.body!);
    }
  });

  it("rejects invalid limits and malformed or foreign-domain cursors", async () => {
    const fixture = await context.managerFixture();
    await context.seedSession({ state: "PARKED" });
    const { authorization } = await context.authenticated(fixture);
    const path = `/v1/staff/dashboard/locations/${fixture.locationId}/overview/sessions`;
    for (const query of ["limit=0", "limit=101", "limit=abc"]) {
      const result = await context.request("GET", `${path}?${query}`, {
        authorization,
      });
      expect(result.status, query).toBe(400);
      expect(result.body?.code).toBe("REQUEST_INVALID");
    }
    const malformed = await context.request("GET", `${path}?cursor=abcdefgh`, {
      authorization,
    });
    expect(malformed.status).toBe(400);
    const page = await context.request("GET", `${path}?limit=1`, {
      authorization,
    });
    expect(page.body?.nextCursor).not.toBeNull();
    const foreign = await context.request(
      "GET",
      `/v1/staff/dashboard/locations/${fixture.locationId}/overview/tasks?cursor=${String(page.body?.nextCursor)}`,
      { authorization },
    );
    expect(foreign.status).toBe(400);
    expect(foreign.body?.code).toBe("REQUEST_INVALID");
  });

  it("exposes no omnibus overview route", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const result = await context.request(
      "GET",
      `/v1/staff/dashboard/locations/${fixture.locationId}/overview`,
      { authorization },
    );
    expect(result.status).toBe(404);
  });

  it("keeps DEC-049 supervisor live-map behavior out of generic overview scope", async () => {
    const fixture = await context.managerFixture();
    await context.seedOverviewData();
    const shiftedSupervisor = await context.staffBearer(
      "VALET_SUPERVISOR",
      true,
    );
    const unshiftedSupervisor = await context.staffBearer("VALET_SUPERVISOR");
    const liveMapPath = `/v1/staff/locations/${fixture.locationId}/live-operations-map`;
    const shiftedLive = await context.request("GET", liveMapPath, {
      authorization: shiftedSupervisor,
    });
    expect(shiftedLive.status).toBe(200);
    const unshiftedLive = await context.request("GET", liveMapPath, {
      authorization: unshiftedSupervisor,
    });
    expect(unshiftedLive.status).toBe(404);
    const supervisorOverview = await context.request(
      "GET",
      `/v1/staff/dashboard/locations/${fixture.locationId}/overview/tasks`,
      { authorization: shiftedSupervisor },
    );
    expect(supervisorOverview.status).toBe(404);
    expect(supervisorOverview.body?.code).toBe("AUTHORIZATION_DENIED");
    const admin = await context.staffBearer("ORG_ADMIN");
    const adminOverview = await context.request(
      "GET",
      `/v1/staff/dashboard/locations/${fixture.locationId}/overview/sessions`,
      { authorization: admin },
    );
    expect(adminOverview.status).toBe(403);
    expect(adminOverview.body?.code).toBe("MFA_STEP_UP_REQUIRED");
  });
});
