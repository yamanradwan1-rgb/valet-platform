import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";

class ReportCommercialContext extends DashboardApiTestContext {
  async rawRequest(
    method: string,
    path: string,
    authorization: string,
    body?: unknown,
  ) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        "X-Request-Id": randomUUID(),
      },
      method,
    });
    return { status: response.status, text: await response.text() };
  }
}

const context = new ReportCommercialContext("be12-report-commercial");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function auditCount(locationId: string) {
  const result = await context.adminPool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE location_id=$1 AND event_type='DASHBOARD_REPORT_EXPORT_GENERATED'`,
    [locationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function setEntitlements(
  organizationId: string,
  dashboardAccess: boolean,
  reportExports: boolean,
) {
  await context.adminPool.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled=$2, report_exports_enabled=$3,
         updated_at=clock_timestamp()
     WHERE organization_id=$1`,
    [organizationId, dashboardAccess, reportExports],
  );
}

describe("MGT-BE-12 Location report commercial matrix", () => {
  it("separates report reads from exports and fails closed on missing state", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const { authorization } = await context.authenticated(fixture);
    const base = `/v1/staff/dashboard/locations/${fixture.locationId}/reports`;
    const exportBody = { date: "2026-07-10", format: "CSV", kind: "DAILY" };
    const countBefore = await auditCount(fixture.locationId);

    expect(
      (await context.request("GET", `${base}/daily?date=2026-07-10`, {
        authorization,
      })).status,
    ).toBe(200);
    expect(
      (await context.rawRequest("POST", `${base}/exports`, authorization, exportBody))
        .status,
    ).toBe(200);
    expect(
      (await context.rawRequest("POST", `${base}/exports`, authorization, exportBody))
        .status,
    ).toBe(200);
    expect(await auditCount(fixture.locationId)).toBe(countBefore + 2);

    await setEntitlements(fixture.organizationId, true, false);
    expect(
      (await context.request("GET", `${base}/daily?date=2026-07-10`, {
        authorization,
      })).status,
    ).toBe(200);
    expect(
      (await context.rawRequest("POST", `${base}/exports`, authorization, exportBody))
        .status,
    ).toBe(404);
    expect(await auditCount(fixture.locationId)).toBe(countBefore + 2);

    await setEntitlements(fixture.organizationId, false, true);
    expect(
      (await context.request("GET", `${base}/daily?date=2026-07-10`, {
        authorization,
      })).status,
    ).toBe(404);
    expect(
      (await context.rawRequest("POST", `${base}/exports`, authorization, exportBody))
        .status,
    ).toBe(404);
    expect(await auditCount(fixture.locationId)).toBe(countBefore + 2);

    await context.adminPool.query(
      `DELETE FROM organization_subscriptions WHERE organization_id=$1`,
      [fixture.organizationId],
    );
    expect(
      (await context.request("GET", `${base}/daily?date=2026-07-10`, {
        authorization,
      })).status,
    ).toBe(404);
    expect(
      (await context.rawRequest("POST", `${base}/exports`, authorization, exportBody))
        .status,
    ).toBe(404);
    expect(await auditCount(fixture.locationId)).toBe(countBefore + 2);
  });
});
