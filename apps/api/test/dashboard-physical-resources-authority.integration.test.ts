import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

const path = (locationId: string) =>
  `/v1/staff/dashboard/locations/${locationId}/physical-resources`;

describe("Issue #232 physical-resource authority", () => {
  it("uses Standard CA read assurance but Sensitive CA create assurance", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id);
    const location = await fixture.addLocation(membership.organizationId);
    const auth = await fixture.nativeLogin(user);

    const noMfa = await fixture.managementGet(
      `${path(location.locationId)}/key-slots`,
      auth.accessToken,
    );
    expect(noMfa.status).toBe(403);
    expect(noMfa.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });

    await fixture.enrollAndAssure(auth);
    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at=mfa_authenticated_at-interval '1 hour',
           mfa_authenticated_at=mfa_authenticated_at-interval '6 minutes',
           last_admin_activity_at=mfa_authenticated_at-interval '1 minute'
       WHERE id=$1`,
      [auth.sessionId],
    );
    expect(
      (await fixture.managementGet(
        `${path(location.locationId)}/key-slots`,
        auth.accessToken,
      )).status,
    ).toBe(200);
    const create = await fixture.managementPost(
      `${path(location.locationId)}/key-slots`,
      auth.accessToken,
      { operationId: randomUUID(), code: "K-01" },
    );
    expect(create.status).toBe(403);
    expect(create.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });

  it.each(["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "denies %s Management physical-resource access",
    async (role) => {
      const user = await fixture.createUser();
      const organizationId = await fixture.createOrganization();
      const membershipId = await fixture.addMembership(organizationId, user.id, role);
      const location = await fixture.addLocation(organizationId);
      await fixture.grantLocationAccess(organizationId, membershipId, location.locationId);
      const auth = await fixture.nativeLogin(user);
      const read = await fixture.managementGet(
        `${path(location.locationId)}/key-slots`,
        auth.accessToken,
      );
      expect(read.status).toBe(404);
      expect(read.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
      const create = await fixture.managementPost(
        `${path(location.locationId)}/key-slots`,
        auth.accessToken,
        { operationId: randomUUID(), code: "K-01" },
      );
      expect(create.status).toBe(404);
      expect(create.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    },
  );

  it("keeps CA historical listing but denies inactive create and label", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id);
    const location = await fixture.addLocation(membership.organizationId);
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    const created = await fixture.managementPost(
      `${path(location.locationId)}/key-slots`,
      auth.accessToken,
      { operationId: randomUUID(), code: "K-01" },
    );
    const keySlotId = String(created.body?.keySlotId);
    await fixture.query(
      `UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1`,
      [location.locationId],
    );
    expect(
      (await fixture.managementGet(
        `${path(location.locationId)}/key-slots`,
        auth.accessToken,
      )).status,
    ).toBe(200);
    expect(
      (await fixture.managementGet(
        `${path(location.locationId)}/key-slots/${keySlotId}/label`,
        auth.accessToken,
      )).status,
    ).toBe(404);
    expect(
      (await fixture.managementPost(
        `${path(location.locationId)}/key-slots`,
        auth.accessToken,
        { operationId: randomUUID(), code: "K-02" },
      )).status,
    ).toBe(404);
  });

  it("rechecks Dashboard entitlement at submit time", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id);
    const location = await fixture.addLocation(membership.organizationId);
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    await fixture.query(
      `UPDATE organization_subscriptions
       SET dashboard_access_enabled=FALSE WHERE organization_id=$1`,
      [membership.organizationId],
    );
    const denied = await fixture.managementPost(
      `${path(location.locationId)}/key-slots`,
      auth.accessToken,
      { operationId: randomUUID(), code: "K-01" },
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
