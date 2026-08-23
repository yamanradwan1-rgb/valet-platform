import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";
import {
  analyticsSeedCashShift,
  analyticsSeedIncident,
  analyticsSeedPayment,
  analyticsSeedSession,
} from "./dashboard-analytics-seed";


beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

class DashboardOverviewApiTestContext extends DashboardApiTestContext {
  async rawRequest(
    method: string,
    path: string,
    options: {
      authorization?: string | undefined;
      body?: unknown;
    } = {},
  ): Promise<{ headers: Headers; status: number; text: string }> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
      headers: {
        ...(options.authorization === undefined
          ? {}
          : { Authorization: options.authorization }),
        "Content-Type": "application/json",
        "X-Request-Id": randomUUID(),
      },
      method,
    });
    return {
      headers: response.headers,
      status: response.status,
      text: await response.text(),
    };
  }
}

const context = new DashboardOverviewApiTestContext("http");

const PERIOD = { date: "2026-07-10", month: "2026-07", weekStart: "2026-07-06" };

async function seedReportData(): Promise<string> {
  const fixture = await context.managerFixture();
  const session = await analyticsSeedSession(context, {
    state: "COMPLETED",
    completedAtIso: "2026-07-10T10:00:00Z",
  });
  await analyticsSeedPayment(context, {
    currency: "JOD",
    paidAtIso: "2026-07-10T11:00:00Z",
    sessionId: session,
  });
  await analyticsSeedIncident(context, {
    createdAtIso: "2026-07-10T09:00:00Z",
  });
  await analyticsSeedCashShift(context, { endedAtIso: "2026-07-10T18:00:00Z" });
  return fixture.locationId;
}


describe("VAL-009E reports HTTP boundary", () => {
  it(
    "composes daily/weekly/monthly JSON and audited CSV/PDF exports",
    async () => {
    const locationId = await seedReportData();
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const base = `/v1/staff/dashboard/locations/${locationId}/reports`;
    const auditsBefore = await auditCount(locationId);
    const daily = await context.request(
      "GET",
      `${base}/daily?date=${PERIOD.date}`,
      { authorization },
    );
    expect(daily.status).toBe(200);
    expect(daily.body).toMatchObject({
      kind: "DAILY",
      periodFrom: "2026-07-10",
      timezone: "Asia/Amman",
    });
    expect(daily.body?.dailyActivity).toBeDefined();
    const weekly = await context.request(
      "GET",
      `${base}/weekly?weekStart=${PERIOD.weekStart}`,
      { authorization },
    );
    expect(weekly.status).toBe(200);
    expect(weekly.body).toMatchObject({
      kind: "WEEKLY",
      summary: {
        currencies: [expect.objectContaining({ currency: "JOD" })],
      },
    });
    const monthly = await context.request(
      "GET",
      `${base}/monthly?month=${PERIOD.month}`,
      { authorization },
    );
    expect(monthly.status).toBe(200);
    for (const format of ["CSV", "PDF"] as const) {
      const kind = format === "CSV" ? "DAILY" : "WEEKLY";
      const body =
        kind === "DAILY"
          ? { date: PERIOD.date, format, kind }
          : { format, kind, weekStart: PERIOD.weekStart };
      const exportResult = await context.rawRequest(
        "POST",
        `${base}/exports`,
        { authorization, body },
      );
      expect(exportResult.status, format).toBe(200);
      const disposition = exportResult.headers.get("content-disposition") ?? "";
      expect(disposition).toContain(
        `filename="report-${kind.toLowerCase()}-`,
      );
      if (format === "CSV") {
        expect(exportResult.headers.get("content-type")).toBe(
          "text/csv; charset=utf-8",
        );
        expect(exportResult.text.startsWith("section,key,subkey,currency,value"))
          .toBe(true);
      } else {
        expect(exportResult.headers.get("content-type")).toBe("application/pdf");
        expect(exportResult.text.startsWith("%PDF-")).toBe(true);
      }
    }
    const auditsAfter = await auditCount(locationId);
    expect(auditsAfter - auditsBefore).toBe(2);
    },
    60_000,
  );

  it("rejects invalid periods with REQUEST_INVALID and no audit rows", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const base = `/v1/staff/dashboard/locations/${fixture.locationId}/reports`;
    const auditsBefore = await auditCount(fixture.locationId);
    for (const [path, query] of [
      ["/daily", "?date=not-a-date"],
      ["/daily", "?"],
      ["/weekly", "?weekStart=2026-07-14"],
      ["/monthly", "?month=2026-13"],
      ["/monthly", "?month=nope"],
    ] as const) {
      const result = await context.request("GET", `${base}${path}${query}`, {
        authorization,
      });
      expect(result.status, `${path}${query}`).toBe(400);
    }
    const malformedExport = await context.request("POST", `${base}/exports`, {
      authorization,
      body: { date: PERIOD.date, format: "CSV", kind: "DAILY", x: 1 },
    });
    expect(malformedExport.status).toBe(400);
    expect(await auditCount(fixture.locationId)).toBe(auditsBefore);
  });

  it("denies non-manager actors non-disclosingly across report routes", async () => {
    const fixture = await context.managerFixture();
    const admin = await context.createStaff(fixture, "ORG_ADMIN");
    const supervisor = await context.createStaff(fixture, "VALET_SUPERVISOR");
    for (const staff of [admin, supervisor]) {
      const login = await context.login(staff);
      const authorization = `Bearer ${String(login.body?.accessToken)}`;
      const base = `/v1/staff/dashboard/locations/${fixture.locationId}/reports`;
      const daily = await context.request("GET", `${base}/daily?date=2026-07-10`, {
        authorization,
      });
      expect(daily.status).toBe(404);
      const exported = await context.request("POST", `${base}/exports`, {
        authorization,
        body: { date: "2026-07-10", format: "CSV", kind: "DAILY" },
      });
      expect(exported.status).toBe(404);
    }
  });

  it("enforces the exact management matrix on all four report routes", async () => {
    const fixture = await context.managerFixture();
    const ungrantedLocation = await context.addLocation(fixture, {
      access: false,
    });
    const inactiveLocation = await context.addLocation(fixture, {
      status: "INACTIVE",
    });
    const otherTenant = await context.createFixture({
      role: "LOCATION_MANAGER",
    });
    const staffBearers = await (async () => {
      const bearers: Record<string, string> = {};
      for (const role of [
        "ORG_ADMIN",
        "VALET_SUPERVISOR",
        "VALET_EMPLOYEE",
      ] as const) {
        const staff = await context.createStaff(fixture, role);
        const login = await context.login(staff);
        expect(login.status).toBe(200);
        bearers[role] = `Bearer ${String(login.body?.accessToken)}`;
      }
      return bearers;
    })();
    const routes: Array<{
      method: string;
      path: string;
      body?: unknown;
    }> = [
      { method: "GET", path: "/daily?date=2026-07-10" },
      { method: "GET", path: "/weekly?weekStart=2026-07-06" },
      { method: "GET", path: "/monthly?month=2026-07" },
      {
        body: { date: "2026-07-10", format: "CSV", kind: "DAILY" },
        method: "POST",
        path: "/exports",
      },
    ];
    async function attempt(
      authorization: string | undefined,
      locationId: string,
      routeIndex: number,
    ) {
      const route = routes[routeIndex]!;
      return context.rawRequest(
        route.method,
        `/v1/staff/dashboard/locations/${locationId}/reports${route.path}`,
        {
          authorization,
          ...(route.body === undefined ? {} : { body: route.body }),
        },
      );
    }
    // Authorized manager succeeds without a Shift on every route.
    const managerAuth = (await context.authenticated(fixture)).authorization;
    for (let index = 0; index < routes.length; index += 1) {
      const ok = await attempt(managerAuth, fixture.locationId, index);
      expect(ok.status, `manager route ${index}`).toBe(200);
    }
    // ORG_ADMIN pre-MFA, Supervisor, and Employee denied on every route.
    for (const role of ["ORG_ADMIN", "VALET_SUPERVISOR", "VALET_EMPLOYEE"]) {
      for (let index = 0; index < routes.length; index += 1) {
        const denied = await attempt(
          staffBearers[role]!,
          fixture.locationId,
          index,
        );
        expect(denied.status, `${role} route ${index}`).toBe(404);
      }
    }
    // Same-org ungranted / cross-tenant / nonexistent / inactive denied.
    const deniedLocations = [
      ungrantedLocation,
      otherTenant.locationId,
      randomUUID(),
      inactiveLocation,
    ];
    for (const target of deniedLocations) {
      for (let index = 0; index < routes.length; index += 1) {
        const denied = await attempt(managerAuth, target, index);
        expect(denied.status, `${target} route ${index}`).toBe(404);
      }
    }
    // Unauthenticated staff boundary.
    for (let index = 0; index < routes.length; index += 1) {
      const unauthorized = await attempt(undefined, fixture.locationId, index);
      expect(unauthorized.status, `unauthenticated route ${index}`).toBe(401);
    }
  });
});

async function auditCount(locationId: string): Promise<number> {
  const result = await context.adminPool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE entity_type = 'Location' AND location_id = $1
       AND event_type = 'DASHBOARD_REPORT_EXPORT_GENERATED'`,
    [locationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

void randomUUID;
