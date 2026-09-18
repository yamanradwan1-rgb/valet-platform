import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    name: "Commercial branding",
  });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

const companyPath = (organizationId: string) =>
  `/v1/staff/management/organizations/${organizationId}/branding`;
const locationPath = (organizationId: string, locationId: string) =>
  `/v1/staff/management/organizations/${organizationId}/locations/${locationId}/branding`;

async function setEntitlements(
  organizationId: string,
  dashboardAccess: boolean,
  basicBranding: boolean,
) {
  await fixture.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled=$2, basic_branding_enabled=$3,
         updated_at=clock_timestamp()
     WHERE organization_id=$1`,
    [organizationId, dashboardAccess, basicBranding],
  );
}

async function auditCount(organizationId: string, eventType: string) {
  const result = await fixture.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE organization_id=$1 AND event_type=$2`,
    [organizationId, eventType],
  );
  return Number(result.rows[0]?.count ?? 0);
}

describe("MGT-BE-12 Company Admin branding commercial access", () => {
  it("requires dashboardAccess and basicBranding for Company reads/writes", async () => {
    const state = await assuredAdmin();
    const path = companyPath(state.membership.organizationId);
    const initial = await fixture.managementGet(path, state.auth.accessToken);
    expect(initial.status).toBe(200);
    const before = await auditCount(
      state.membership.organizationId,
      "MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED",
    );

    await setEntitlements(state.membership.organizationId, true, false);
    expect((await fixture.managementGet(path, state.auth.accessToken)).status).toBe(404);
    const deniedBasic = await fixture.managementPut(
      `${path}/default`,
      state.auth.accessToken,
      {
        expectedUpdatedAt: initial.body?.updatedAt,
        setting: "brandPrimaryColor",
        value: "#123ABC",
      },
    );
    expect(deniedBasic.status).toBe(404);

    await setEntitlements(state.membership.organizationId, false, true);
    expect((await fixture.managementGet(path, state.auth.accessToken)).status).toBe(404);
    const deniedDashboard = await fixture.managementPut(
      `${path}/default`,
      state.auth.accessToken,
      {
        expectedUpdatedAt: initial.body?.updatedAt,
        setting: "brandPrimaryColor",
        value: "#123ABC",
      },
    );
    expect(deniedDashboard.status).toBe(404);

    const row = await fixture.query<{ brand_primary_color: string; updated_at: Date }>(
      `SELECT brand_primary_color,updated_at FROM organizations WHERE id=$1`,
      [state.membership.organizationId],
    );
    expect(row.rows[0]?.brand_primary_color).toBe("#176BFF");
    expect(row.rows[0]?.updated_at.toISOString()).toBe(initial.body?.updatedAt);
    expect(
      await auditCount(
        state.membership.organizationId,
        "MANAGEMENT_COMPANY_BRANDING_DEFAULT_CHANGED",
      ),
    ).toBe(before);
  });

  it("rechecks current entitlement after a successful stale client read", async () => {
    const state = await assuredAdmin();
    const path = companyPath(state.membership.organizationId);
    const snapshot = await fixture.managementGet(path, state.auth.accessToken);
    expect(snapshot.status).toBe(200);
    await setEntitlements(state.membership.organizationId, true, false);
    const denied = await fixture.managementPut(
      `${path}/default`,
      state.auth.accessToken,
      {
        expectedUpdatedAt: snapshot.body?.updatedAt,
        setting: "brandDisplayName",
        value: "Must not apply",
      },
    );
    expect(denied).toMatchObject({
      status: 404,
      body: { code: "AUTHORIZATION_DENIED" },
    });
  });

  it("applies the same entitlement to exact-Location Company Admin branding", async () => {
    const state = await assuredAdmin();
    const location = await fixture.addLocation(state.membership.organizationId);
    const path = locationPath(
      state.membership.organizationId,
      location.locationId,
    );
    const initial = await fixture.managementGet(path, state.auth.accessToken);
    expect(initial.status).toBe(200);
    const before = await auditCount(
      state.membership.organizationId,
      "MANAGEMENT_LOCATION_BRANDING_OVERRIDE_CHANGED",
    );
    await setEntitlements(state.membership.organizationId, true, false);
    const denied = await fixture.managementPut(
      `${path}/override`,
      state.auth.accessToken,
      {
        expectedUpdatedAt: initial.body?.updatedAt,
        setting: "brandPrimaryColor",
        value: "#123ABC",
      },
    );
    expect(denied.status).toBe(404);
    const row = await fixture.query<{
      brand_primary_color_override: string | null;
      updated_at: Date;
    }>(
      `SELECT brand_primary_color_override,updated_at FROM locations WHERE id=$1`,
      [location.locationId],
    );
    expect(row.rows[0]?.brand_primary_color_override).toBeNull();
    expect(row.rows[0]?.updated_at.toISOString()).toBe(initial.body?.updatedAt);
    expect(
      await auditCount(
        state.membership.organizationId,
        "MANAGEMENT_LOCATION_BRANDING_OVERRIDE_CHANGED",
      ),
    ).toBe(before);
  });
});
