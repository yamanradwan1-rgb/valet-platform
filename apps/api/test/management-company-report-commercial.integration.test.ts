import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id, {
    name: "BE-12 report matrix",
  });
  await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership };
}

async function setEntitlements(
  organizationId: string,
  dashboardAccess: boolean,
  reportExports: boolean,
) {
  await fixture.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled=$2, report_exports_enabled=$3,
         updated_at=clock_timestamp()
     WHERE organization_id=$1`,
    [organizationId, dashboardAccess, reportExports],
  );
}

async function auditCount(organizationId: string) {
  const result = await fixture.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM audit_events
     WHERE organization_id=$1 AND location_id IS NULL
       AND event_type='DASHBOARD_REPORT_EXPORT_GENERATED'`,
    [organizationId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

function exportRequest(organizationId: string, accessToken: string) {
  return fixture.requestBytes(
    `/v1/staff/management/organizations/${organizationId}/reports/exports`,
    {
      authorization: `Bearer ${accessToken}`,
      body: { date: "2026-07-10", format: "CSV", kind: "DAILY" },
      method: "POST",
    },
  );
}

describe("MGT-BE-12 Company report commercial matrix", () => {
  it("separates dashboard report reads from the additional export entitlement", async () => {
    const state = await assuredAdmin();
    const organizationId = state.membership.organizationId;
    const readPath =
      `/v1/staff/management/organizations/${organizationId}/reports/daily?date=2026-07-10`;
    const countBefore = await auditCount(organizationId);

    expect(
      (await fixture.managementGet(readPath, state.auth.accessToken)).status,
    ).toBe(200);
    expect((await exportRequest(organizationId, state.auth.accessToken)).status).toBe(
      200,
    );
    expect(await auditCount(organizationId)).toBe(countBefore + 1);

    await setEntitlements(organizationId, true, false);
    expect(
      (await fixture.managementGet(readPath, state.auth.accessToken)).status,
    ).toBe(200);
    expect((await exportRequest(organizationId, state.auth.accessToken)).status).toBe(
      404,
    );
    expect(await auditCount(organizationId)).toBe(countBefore + 1);

    await setEntitlements(organizationId, false, true);
    expect(
      (await fixture.managementGet(readPath, state.auth.accessToken)).status,
    ).toBe(404);
    expect((await exportRequest(organizationId, state.auth.accessToken)).status).toBe(
      404,
    );
    expect(await auditCount(organizationId)).toBe(countBefore + 1);

    await fixture.query(
      `DELETE FROM organization_subscriptions WHERE organization_id=$1`,
      [organizationId],
    );
    expect(
      (await fixture.managementGet(readPath, state.auth.accessToken)).status,
    ).toBe(404);
    expect((await exportRequest(organizationId, state.auth.accessToken)).status).toBe(
      404,
    );
    expect(await auditCount(organizationId)).toBe(countBefore + 1);
  });
});
