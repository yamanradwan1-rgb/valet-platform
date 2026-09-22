import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

function authority(
  organizationId: string,
  feature: "MANAGEMENT_AUDIT" | "VISIT_CONTACTS",
  locationId?: string,
) {
  const params = new URLSearchParams({ feature, organizationId });
  if (locationId !== undefined) params.set("locationId", locationId);
  return `/v1/staff/dashboard/feature-authority?${params.toString()}`;
}

async function disableDashboard(organizationId: string) {
  await fixture.query(
    `UPDATE organization_subscriptions
     SET dashboard_access_enabled = FALSE
     WHERE organization_id = $1`,
    [organizationId],
  );
}

async function entitleDashboard(organizationId: string) {
  await fixture.query(
    `INSERT INTO organization_subscriptions
       (organization_id, plan_code, status, dashboard_access_enabled,
        report_exports_enabled, basic_branding_enabled)
     VALUES ($1, 'TEST_ENTITLED', 'ACTIVE', TRUE, TRUE, TRUE)`,
    [organizationId],
  );
}

describe("Dashboard feature authority", () => {
  it("reuses current CA MFA, D-access, Organization and exact-Location authority", async () => {
    const admin = await fixture.createCompanyAdmin();
    await entitleDashboard(admin.organizationId);
    const inactive = await fixture.addLocation(admin.organizationId, { status: "INACTIVE" });
    const auth = await fixture.nativeLogin(admin);

    expect((await fixture.managementGet(
      authority(admin.organizationId, "VISIT_CONTACTS"),
      auth.accessToken,
    )).body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    await fixture.enrollAndAssure(auth);
    const auditCountBefore = await fixture.auditCount(admin.organizationId);

    const contact = await fixture.managementGet(
      authority(admin.organizationId, "VISIT_CONTACTS"), auth.accessToken,
    );
    expect(contact.status).toBe(200);
    expect(contact.body).toEqual({
      feature: "VISIT_CONTACTS",
      organizationId: admin.organizationId,
      role: "ORG_ADMIN",
      scope: { kind: "ORGANIZATION" },
    });

    const organizationAudit = await fixture.managementGet(
      authority(admin.organizationId, "MANAGEMENT_AUDIT"), auth.accessToken,
    );
    expect(organizationAudit.status).toBe(200);
    expect(organizationAudit.body).toMatchObject({
      role: "ORG_ADMIN",
      scope: { kind: "ORGANIZATION" },
    });

    const audit = await fixture.managementGet(
      authority(admin.organizationId, "MANAGEMENT_AUDIT", inactive.locationId),
      auth.accessToken,
    );
    expect(audit.status).toBe(200);
    expect(audit.body).toMatchObject({
      role: "ORG_ADMIN",
      scope: { kind: "LOCATION", locationId: inactive.locationId },
    });
    expect(await fixture.auditCount(admin.organizationId)).toBe(auditCountBefore);

    await disableDashboard(admin.organizationId);
    expect((await fixture.managementGet(
      authority(admin.organizationId, "VISIT_CONTACTS"), auth.accessToken,
    )).status).toBe(404);
    expect((await fixture.managementGet(
      authority(admin.organizationId, "MANAGEMENT_AUDIT"), auth.accessToken,
    )).status).toBe(404);
  });

  it("represents LM Visit Contacts as current Organization grant-set authority", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(organizationId, user.id, "LOCATION_MANAGER");
    const inactive = await fixture.addLocation(organizationId, { status: "INACTIVE" });
    await fixture.grantLocationAccess(organizationId, membershipId, inactive.locationId);
    const auth = await fixture.nativeLogin(user);

    const response = await fixture.managementGet(
      authority(organizationId, "VISIT_CONTACTS"), auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      feature: "VISIT_CONTACTS",
      organizationId,
      role: "LOCATION_MANAGER",
      scope: { kind: "ORGANIZATION_GRANT_SET" },
    });

    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE organization_id = $1 AND membership_id = $2`,
      [organizationId, membershipId],
    );
    expect((await fixture.managementGet(
      authority(organizationId, "VISIT_CONTACTS"), auth.accessToken,
    )).status).toBe(404);

    await fixture.grantLocationAccess(organizationId, membershipId, inactive.locationId);
    await disableDashboard(organizationId);
    expect((await fixture.managementGet(
      authority(organizationId, "VISIT_CONTACTS"), auth.accessToken,
    )).status).toBe(404);
  });

  it("allows LM Audit for a current inactive grant and honors grant/D revocation", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(organizationId, user.id, "LOCATION_MANAGER");
    const inactive = await fixture.addLocation(organizationId, { status: "INACTIVE" });
    const ungranted = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(organizationId, membershipId, inactive.locationId);
    const auth = await fixture.nativeLogin(user);

    const allowed = await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT", inactive.locationId),
      auth.accessToken,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({
      role: "LOCATION_MANAGER",
      scope: { kind: "LOCATION", locationId: inactive.locationId },
    });
    expect((await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT", ungranted.locationId),
      auth.accessToken,
    )).status).toBe(404);
    expect((await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT"), auth.accessToken,
    )).status).toBe(404);

    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE organization_id = $1 AND membership_id = $2 AND location_id = $3`,
      [organizationId, membershipId, inactive.locationId],
    );
    expect((await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT", inactive.locationId),
      auth.accessToken,
    )).status).toBe(404);
    await fixture.grantLocationAccess(organizationId, membershipId, inactive.locationId);

    await disableDashboard(organizationId);
    expect((await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT", inactive.locationId),
      auth.accessToken,
    )).status).toBe(404);
  });

  it("requires exact current Supervisor grant, ACTIVE Location, active Shift and D-access", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(organizationId, user.id, "VALET_SUPERVISOR");
    const location = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(organizationId, membershipId, location.locationId);
    const shiftId = await fixture.startActiveShift(organizationId, location.locationId, membershipId);
    const auth = await fixture.nativeLogin(user);

    const allowed = await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT", location.locationId),
      auth.accessToken,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ role: "VALET_SUPERVISOR" });
    expect((await fixture.managementGet(
      authority(organizationId, "VISIT_CONTACTS"), auth.accessToken,
    )).status).toBe(404);

    await fixture.endShift(shiftId);
    expect((await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT", location.locationId),
      auth.accessToken,
    )).status).toBe(404);

    await fixture.startActiveShift(organizationId, location.locationId, membershipId);
    await disableDashboard(organizationId);
    expect((await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT", location.locationId),
      auth.accessToken,
    )).status).toBe(404);
  });

  it("denies Employee and rejects out-of-contract queries", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    await fixture.addMembership(organizationId, user.id, "VALET_EMPLOYEE");
    const auth = await fixture.nativeLogin(user);
    expect((await fixture.managementGet(
      authority(organizationId, "MANAGEMENT_AUDIT"), auth.accessToken,
    )).status).toBe(404);
    expect((await fixture.managementGet(
      `${authority(organizationId, "VISIT_CONTACTS")}&locationId=11111111-1111-4111-8111-111111111111`,
      auth.accessToken,
    )).status).toBe(400);
  });
});
