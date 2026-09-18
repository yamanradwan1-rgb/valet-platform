import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

const subscriptionPath = (organizationId: string) =>
  `/v1/staff/management/organizations/${organizationId}/subscription`;
const integrationsPath = (organizationId: string) =>
  `/v1/staff/management/organizations/${organizationId}/integrations`;

async function assuredAdmin(entitled = true) {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    entitled,
    name: "BE-12 commercial",
  });
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership, user };
}

async function setSubscription(
  organizationId: string,
  values: readonly [string, string, boolean],
) {
  await fixture.query(
    `UPDATE organization_subscriptions
     SET plan_code=$2, status=$3::organization_subscription_status,
         dashboard_access_enabled=$4, updated_at=clock_timestamp()
     WHERE organization_id=$1`,
    [organizationId, ...values],
  );
}

describe("MGT-BE-12 commercial and integrations HTTP", () => {
  it("reads exact commercial state even while dashboardAccess is false", async () => {
    const state = await assuredAdmin();
    await fixture.query(
      `UPDATE organization_subscriptions
       SET plan_code='ENTERPRISE_ULTRA_WHATEVER', status='SUSPENDED',
           dashboard_access_enabled=FALSE, report_exports_enabled=TRUE,
           basic_branding_enabled=TRUE WHERE organization_id=$1`,
      [state.membership.organizationId],
    );
    const before = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE organization_id=$1`,
      [state.membership.organizationId],
    );
    const response = await fixture.managementGet(
      subscriptionPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(response).toMatchObject({ status: 200 });
    expect(response.body).toEqual({
      organizationId: state.membership.organizationId,
      subscription: {
        entitlements: {
          basicBranding: true,
          dashboardAccess: false,
          reportExports: true,
        },
        planCode: "ENTERPRISE_ULTRA_WHATEVER",
        status: "SUSPENDED",
      },
    });
    const after = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events WHERE organization_id=$1`,
      [state.membership.organizationId],
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it("returns null for an absent row without fabricating persistence", async () => {
    const state = await assuredAdmin(false);
    const response = await fixture.managementGet(
      subscriptionPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(response.body).toEqual({
      organizationId: state.membership.organizationId,
      subscription: null,
    });
    const rows = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM organization_subscriptions
       WHERE organization_id=$1`,
      [state.membership.organizationId],
    );
    expect(rows.rows[0]?.count).toBe("0");
  });

  it("uses current booleans, never planCode or status, as access authority", async () => {
    const state = await assuredAdmin();
    const path = integrationsPath(state.membership.organizationId);
    expect((await fixture.managementGet(path, state.auth.accessToken)).status).toBe(200);
    await setSubscription(state.membership.organizationId, ["A", "TRIAL", true]);
    expect((await fixture.managementGet(path, state.auth.accessToken)).status).toBe(200);
    await setSubscription(state.membership.organizationId, [
      "ENTERPRISE_ULTRA_WHATEVER",
      "SUSPENDED",
      true,
    ]);
    expect((await fixture.managementGet(path, state.auth.accessToken)).status).toBe(200);
    await setSubscription(state.membership.organizationId, [
      "ENTERPRISE_ULTRA_WHATEVER",
      "SUSPENDED",
      false,
    ]);
    const denied = await fixture.managementGet(path, state.auth.accessToken);
    expect(denied).toMatchObject({
      status: 404,
      body: { code: "AUTHORIZATION_DENIED" },
    });
  });

  it("fails closed for an absent row on protected Management use", async () => {
    const state = await assuredAdmin(false);
    const response = await fixture.managementGet(
      integrationsPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(response).toMatchObject({
      status: 404,
      body: { code: "AUTHORIZATION_DENIED" },
    });
  });

  it("returns only the fixed provider-neutral integrations projection", async () => {
    const state = await assuredAdmin();
    const response = await fixture.managementGet(
      integrationsPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(
      (response.body?.integrations as Array<{ key: string }>).map(({ key }) => key),
    ).toEqual(["PLATE_OCR", "STAFF_PUSH", "DIGITAL_PAYMENT"]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /endpoint|token|projectId|providerReference|credential|secret|account/i,
    );
  });

  it("keeps foreign tenants and non-admin roles non-disclosing", async () => {
    const state = await assuredAdmin();
    const foreign = await fixture.createOrganization({ name: "Foreign BE-12" });
    expect(
      (await fixture.managementGet(
        subscriptionPath(foreign),
        state.auth.accessToken,
      )).status,
    ).toBe(404);
    for (const role of [
      "LOCATION_MANAGER",
      "VALET_SUPERVISOR",
      "VALET_EMPLOYEE",
    ] as const) {
      const user = await fixture.createUser();
      const membership = await fixture.createMembership(user.id, { role });
      const auth = await fixture.nativeLogin(user);
      const response = await fixture.managementGet(
        integrationsPath(membership.organizationId),
        auth.accessToken,
      );
      expect(response.status).toBe(404);
    }
  });

  it("revalidates MFA and current tenant authority before commercial state", async () => {
    const stale = await assuredAdmin();
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=clock_timestamp()-interval '2 hours',
           mfa_authenticated_at=clock_timestamp()-interval '40 minutes',
           last_admin_activity_at=clock_timestamp()-interval '30 minutes'
       WHERE id=$1`,
      [stale.auth.sessionId],
    );
    expect(
      (await fixture.managementGet(
        integrationsPath(stale.membership.organizationId),
        stale.auth.accessToken,
      )).status,
    ).toBe(403);

    const inactive = await assuredAdmin();
    await fixture.query(
      `UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1`,
      [inactive.membership.membershipId],
    );
    expect(
      (await fixture.managementGet(
        integrationsPath(inactive.membership.organizationId),
        inactive.auth.accessToken,
      )).status,
    ).toBe(404);

    const inactiveOrg = await assuredAdmin();
    await fixture.query(
      `UPDATE organizations SET status='INACTIVE' WHERE id=$1`,
      [inactiveOrg.membership.organizationId],
    );
    expect(
      (await fixture.managementGet(
        integrationsPath(inactiveOrg.membership.organizationId),
        inactiveOrg.auth.accessToken,
      )).status,
    ).toBe(404);
  });

  it("protects the commercial read with current Company Admin authority only", async () => {
    for (const role of [
      "LOCATION_MANAGER",
      "VALET_SUPERVISOR",
      "VALET_EMPLOYEE",
    ] as const) {
      const user = await fixture.createUser();
      const membership = await fixture.createMembership(user.id, { role });
      const auth = await fixture.nativeLogin(user);
      expect(
        (await fixture.managementGet(
          subscriptionPath(membership.organizationId),
          auth.accessToken,
        )).status,
      ).toBe(404);
    }

    const disabled = await assuredAdmin();
    await fixture.query(`UPDATE users SET status='DISABLED' WHERE id=$1`, [
      disabled.user.id,
    ]);
    expect(
      (await fixture.managementGet(
        subscriptionPath(disabled.membership.organizationId),
        disabled.auth.accessToken,
      )).status,
    ).toBe(401);

    const reduced = await assuredAdmin();
    await fixture.query(
      `UPDATE organization_memberships SET role='LOCATION_MANAGER' WHERE id=$1`,
      [reduced.membership.membershipId],
    );
    expect(
      (await fixture.managementGet(
        subscriptionPath(reduced.membership.organizationId),
        reduced.auth.accessToken,
      )).status,
    ).toBe(404);

    const active = await assuredAdmin();
    const guestStyle = await fixture.request(
      subscriptionPath(active.membership.organizationId),
      { authorization: "Bearer guest-token", method: "GET" },
    );
    expect(guestStyle.status).toBe(401);
  });
});
