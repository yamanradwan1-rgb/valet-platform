import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementControlPlaneTestFixture } from "./management-control-plane-test-fixture";

const fixture = new ManagementControlPlaneTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function staffPath(organizationId: string, membershipId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/staff/${membershipId}`;
}

describe("R05 Staff commercial entitlement revalidation", () => {
  it("denies a role mutation after Dashboard entitlement is revoked", async () => {
    const admin = await fixture.createUser();
    const actor = await fixture.createMembership(admin.id);
    const auth = await fixture.nativeLogin(admin);
    await fixture.enrollAndAssure(auth);

    const target = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      actor.organizationId,
      target.id,
      "VALET_EMPLOYEE",
    );
    const path = staffPath(actor.organizationId, membershipId);

    const before = await fixture.managementGet(path, auth.accessToken);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      membershipId,
      role: "VALET_EMPLOYEE",
      version: 1,
    });

    await fixture.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled=FALSE
       WHERE organization_id=$1`,
      [actor.organizationId],
    );

    const denied = await fixture.managementPost(
      `${path}/role`,
      auth.accessToken,
      { expectedVersion: 1, role: "LOCATION_MANAGER" },
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "The requested resource is not available.",
    });

    const persisted = await fixture.query<{ role: string; version: number }>(
      `SELECT role, version
       FROM organization_memberships
       WHERE id=$1 AND organization_id=$2`,
      [membershipId, actor.organizationId],
    );
    expect(persisted.rows[0]).toEqual({
      role: "VALET_EMPLOYEE",
      version: 1,
    });

    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM audit_events
       WHERE organization_id=$1
         AND entity_id=$2
         AND event_type='STAFF_ROLE_CHANGED'`,
      [actor.organizationId, membershipId],
    );
    expect(audit.rows[0]?.count).toBe("0");
  });
});
