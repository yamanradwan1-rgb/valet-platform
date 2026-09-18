import { randomUUID } from "node:crypto";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { DashboardApiTestContext } from "./dashboard-api-test-context";

class DashboardOverviewApiTestContext extends DashboardApiTestContext {}

const context = new DashboardOverviewApiTestContext("g8");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());

describe("VAL-009F G8 HTTP boundary", () => {
  it("reads default branding and applies/clears overrides with concurrency", async () => {
    const fixture = await context.managerFixture();
    await context.adminPool.query(
      `UPDATE organizations SET name = 'Original name' WHERE id = $1`,
      [fixture.organizationId],
    );
    const { authorization } = await context.authenticated(fixture);
    const base = `/v1/staff/dashboard/locations/${fixture.locationId}`;

    const initial = await context.request("GET", `${base}/branding`, {
      authorization,
    });
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      displayName: {
        default: "Original name",
        effective: "Original name",
        override: null,
        overridePresent: false,
      },
      primaryColor: {
        default: "#176BFF",
        effective: "#176BFF",
        override: null,
        overridePresent: false,
      },
    });
    expect(initial.body && JSON.stringify(initial.body)).not.toContain("logo");

    const staleToken = initial.body?.updatedAt;
    const set = await context.request("PUT", `${base}/branding/override`, {
      authorization,
      body: {
        expectedUpdatedAt: staleToken,
        setting: "brandDisplayName",
        value: "فندق النخبة",
      },
    });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({
      displayName: {
        effective: "فندق النخبة",
        override: "فندق النخبة",
        overridePresent: true,
      },
      primaryColor: {
        effective: "#176BFF",
        overridePresent: false,
      },
    });

    const conflict = await context.request("PUT", `${base}/branding/override`, {
      authorization,
      body: {
        expectedUpdatedAt: staleToken,
        setting: "brandDisplayName",
        value: "Second",
      },
    });
    expect(conflict.status).toBe(409);

    const invalidColor = await context.request(
      "PUT",
      `${base}/branding/override`,
      {
        authorization,
        body: {
          expectedUpdatedAt: set.body?.updatedAt,
          setting: "brandPrimaryColor",
          value: "#00bfff",
        },
      },
    );
    expect(invalidColor.status).toBe(400);

    const cleared = await context.request(
      "POST",
      `${base}/branding/override/clear`,
      {
        authorization,
        body: {
          expectedUpdatedAt: set.body?.updatedAt,
          setting: "brandDisplayName",
        },
      },
    );
    expect(cleared.status).toBe(201);
    expect(cleared.body).toMatchObject({
      displayName: { effective: "Original name", overridePresent: false },
    });
  });

  it("reads subscription state (absent and configured) read-only", async () => {
    const fixture = await context.managerFixture();
    const { authorization } = await context.authenticated(fixture);
    const path = `/v1/staff/dashboard/locations/${fixture.locationId}/subscription`;
    await context.adminPool.query(
      `DELETE FROM organization_subscriptions WHERE organization_id = $1`,
      [fixture.organizationId],
    );
    const absent = await context.request("GET", path, { authorization });
    expect(absent.status).toBe(200);
    expect(absent.body).toEqual({
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      subscription: null,
    });
    await context.adminPool.query(
      `INSERT INTO organization_subscriptions
         (organization_id, plan_code, status, dashboard_access_enabled,
          report_exports_enabled, basic_branding_enabled)
       VALUES ($1, 'PILOT_STANDARD', 'TRIAL', TRUE, TRUE, TRUE)`,
      [fixture.organizationId],
    );
    const configured = await context.request("GET", path, { authorization });
    expect(configured.status).toBe(200);
    expect(configured.body).toEqual({
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      subscription: {
        entitlements: {
          basicBranding: true,
          dashboardAccess: true,
          reportExports: true,
        },
        planCode: "PILOT_STANDARD",
        status: "TRIAL",
      },
    });
    expect(JSON.stringify(configured.body)).not.toMatch(
      /price|stripe|invoice|checkout/i,
    );
  });

  it("denies every non-manager path non-disclosingly across G8 routes", async () => {
    const fixture = await context.managerFixture();
    const ungrantedLocation = await context.addLocation(fixture, {
      access: false,
    });
    const inactiveLocation = await context.addLocation(fixture, {
      status: "INACTIVE",
    });
    for (const role of [
      "ORG_ADMIN",
      "VALET_SUPERVISOR",
      "VALET_EMPLOYEE",
    ] as const) {
      const staff = await context.createStaff(fixture, role);
      const login = await context.login(staff);
      const authorization = `Bearer ${String(login.body?.accessToken)}`;
      for (const target of [
        fixture.locationId,
        ungrantedLocation,
        randomUUID(),
        inactiveLocation,
      ]) {
        const branding = await context.request(
          "GET",
          `/v1/staff/dashboard/locations/${target}/branding`,
          { authorization },
        );
        expect(branding.status, `${role} ${target}`).toBe(404);
      }
      const subscription = await context.request(
        "GET",
        `/v1/staff/dashboard/locations/${fixture.locationId}/subscription`,
        { authorization },
      );
      expect(subscription.status, `sub ${role}`).toBe(404);
      const exported = await context.request(
        "PUT",
        `/v1/staff/dashboard/locations/${ungrantedLocation}/branding/override`,
        {
          authorization,
          body: {
            expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
            setting: "brandDisplayName",
            value: "X",
          },
        },
      );
      expect(exported.status).toBe(404);
    }
    const noAuth = await context.request(
      "GET",
      `/v1/staff/dashboard/locations/${fixture.locationId}/branding`,
      {},
    );
    expect(noAuth.status).toBe(401);
  });
});
afterAll(() => context.teardownApi(), 60_000);
