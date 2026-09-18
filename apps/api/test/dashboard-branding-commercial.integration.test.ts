import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";

const context = new DashboardApiTestContext("be12-branding-commercial");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function setEntitlements(
  organizationId: string,
  dashboardAccess: boolean,
  basicBranding: boolean,
) {
  await context.adminPool.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled=$2, basic_branding_enabled=$3,
         updated_at=clock_timestamp()
     WHERE organization_id=$1`,
    [organizationId, dashboardAccess, basicBranding],
  );
}

describe("MGT-BE-12 Location Manager branding commercial access", () => {
  it("requires dashboardAccess and basicBranding without mutating on denial", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const base = `/v1/staff/dashboard/locations/${fixture.locationId}`;
    const initial = await context.request("GET", `${base}/branding`, {
      authorization,
    });
    expect(initial.status).toBe(200);
    const auditBefore = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE location_id=$1
         AND event_type='DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED'`,
      [fixture.locationId],
    );

    await setEntitlements(fixture.organizationId, true, false);
    expect(
      (await context.request("GET", `${base}/branding`, { authorization })).status,
    ).toBe(404);
    const deniedBasic = await context.request(
      "PUT",
      `${base}/branding/override`,
      {
        authorization,
        body: {
          expectedUpdatedAt: initial.body?.updatedAt,
          setting: "brandPrimaryColor",
          value: "#123ABC",
        },
      },
    );
    expect(deniedBasic.status).toBe(404);

    await setEntitlements(fixture.organizationId, false, true);
    const deniedDashboard = await context.request(
      "PUT",
      `${base}/branding/override`,
      {
        authorization,
        body: {
          expectedUpdatedAt: initial.body?.updatedAt,
          setting: "brandPrimaryColor",
          value: "#123ABC",
        },
      },
    );
    expect(deniedDashboard.status).toBe(404);
    const row = await context.adminPool.query<{
      brand_primary_color_override: string | null;
      updated_at: Date;
    }>(
      `SELECT brand_primary_color_override,updated_at FROM locations WHERE id=$1`,
      [fixture.locationId],
    );
    expect(row.rows[0]?.brand_primary_color_override).toBeNull();
    expect(row.rows[0]?.updated_at.toISOString()).toBe(initial.body?.updatedAt);
    const auditAfter = await context.adminPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE location_id=$1
         AND event_type='DASHBOARD_LOCATION_BRANDING_OVERRIDE_CHANGED'`,
      [fixture.locationId],
    );
    expect(auditAfter.rows[0]?.count).toBe(auditBefore.rows[0]?.count);
  });

  it("does not trust an enabled branding snapshot after current revocation", async () => {
    const fixture = await context.createFixture({ role: "LOCATION_MANAGER" });
    const { authorization } = await context.authenticated(fixture);
    const base = `/v1/staff/dashboard/locations/${fixture.locationId}`;
    const snapshot = await context.request("GET", `${base}/branding`, {
      authorization,
    });
    expect(snapshot.status).toBe(200);
    await setEntitlements(fixture.organizationId, true, false);
    const denied = await context.request(
      "PUT",
      `${base}/branding/override`,
      {
        authorization,
        body: {
          expectedUpdatedAt: snapshot.body?.updatedAt,
          setting: "brandDisplayName",
          value: "Must not apply",
        },
      },
    );
    expect(denied).toMatchObject({
      status: 404,
      body: { code: "AUTHORIZATION_DENIED" },
    });
  });
});
