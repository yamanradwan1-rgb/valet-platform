import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function organizationPath(organizationId: string): string {
  return `/v1/staff/management/organizations/${organizationId}/audit-events`;
}

function locationPath(organizationId: string, locationId: string): string {
  return `${organizationPath(organizationId).replace(/\/audit-events$/, "")}/locations/${locationId}/audit-events`;
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const location = await fixture.addLocation(membership.organizationId);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, location, membership, user };
}

describe("MGT-BE-06 Management audit HTTP Company Admin authorization", () => {
  it("accepts STANDARD MFA on Organization and exact-Location reads", async () => {
    const state = await assuredAdmin();
    await fixture.insertAuditEvent({
      eventType: "VALET_SESSION_CREATED",
      locationId: state.location.locationId,
      organizationId: state.membership.organizationId,
    });

    const organization = await fixture.managementGet(
      organizationPath(state.membership.organizationId),
      state.auth.accessToken,
    );
    expect(organization.status).toBe(200);
    expect(organization.body?.items).toHaveLength(1);

    const location = await fixture.managementGet(
      locationPath(
        state.membership.organizationId,
        state.location.locationId,
      ),
      state.auth.accessToken,
    );
    expect(location.status).toBe(200);
    expect(location.body?.items).toHaveLength(1);
  });

  it("denies password-only and expired STANDARD MFA assurance", async () => {
    const user = await fixture.createUser();
    const membership = await fixture.createMembership(user.id);
    const auth = await fixture.nativeLogin(user);
    const path = organizationPath(membership.organizationId);

    const passwordOnly = await fixture.managementGet(path, auth.accessToken);
    expect(passwordOnly.status).toBe(403);
    expect(passwordOnly.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });

    await fixture.enrollAndAssure(auth);
    expect((await fixture.managementGet(path, auth.accessToken)).status).toBe(200);

    await fixture.query(
      `UPDATE staff_auth_sessions
       SET created_at = clock_timestamp() - interval '9 hours',
           mfa_authenticated_at = clock_timestamp() - interval '8 hours 1 minute',
           last_admin_activity_at = clock_timestamp()
       WHERE id = $1`,
      [auth.sessionId],
    );
    const expired = await fixture.managementGet(path, auth.accessToken);
    expect(expired.status).toBe(403);
    expect(expired.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
  });

  it("reauthorizes current role, membership, Organization, and User state", async () => {
    const state = await assuredAdmin();
    const path = organizationPath(state.membership.organizationId);
    expect((await fixture.managementGet(path, state.auth.accessToken)).status).toBe(200);

    await fixture.query(
      `UPDATE organization_memberships SET role = 'VALET_EMPLOYEE' WHERE id = $1`,
      [state.membership.membershipId],
    );
    const wrongRole = await fixture.managementGet(path, state.auth.accessToken);
    expect(wrongRole.status).toBe(404);
    expect(wrongRole.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await fixture.query(
      `UPDATE organization_memberships SET role = 'ORG_ADMIN', status = 'INACTIVE'
       WHERE id = $1`,
      [state.membership.membershipId],
    );
    const inactiveMembership = await fixture.managementGet(
      path,
      state.auth.accessToken,
    );
    expect(inactiveMembership.status).toBe(404);
    expect(inactiveMembership.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await fixture.query(
      `UPDATE organization_memberships SET status = 'ACTIVE' WHERE id = $1`,
      [state.membership.membershipId],
    );
    await fixture.query(`UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`, [
      state.membership.organizationId,
    ]);
    const inactiveOrganization = await fixture.managementGet(
      path,
      state.auth.accessToken,
    );
    expect(inactiveOrganization.status).toBe(404);
    expect(inactiveOrganization.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    await fixture.query(`UPDATE organizations SET status = 'ACTIVE' WHERE id = $1`, [
      state.membership.organizationId,
    ]);
    await fixture.query(`UPDATE users SET status = 'DISABLED' WHERE id = $1`, [
      state.user.id,
    ]);
    const inactiveUser = await fixture.managementGet(path, state.auth.accessToken);
    expect(inactiveUser.status).toBe(401);
    expect(inactiveUser.body).toMatchObject({ code: "STAFF_AUTHENTICATION_REQUIRED" });
  });

  it("returns non-disclosing denial for foreign Organizations and Locations", async () => {
    const state = await assuredAdmin();
    const foreignOrganizationId = await fixture.createOrganization();
    const foreignLocation = await fixture.addLocation(foreignOrganizationId);

    const foreignOrganization = await fixture.managementGet(
      organizationPath(foreignOrganizationId),
      state.auth.accessToken,
    );
    expect(foreignOrganization.status).toBe(404);
    expect(foreignOrganization.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });

    const foreignLocationInOwnPath = await fixture.managementGet(
      locationPath(
        state.membership.organizationId,
        foreignLocation.locationId,
      ),
      state.auth.accessToken,
    );
    expect(foreignLocationInOwnPath.status).toBe(404);
    expect(foreignLocationInOwnPath.body).toMatchObject({
      code: "AUTHORIZATION_DENIED",
    });
  });
});
