import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

const fixture = new ManagementVisitContactTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function search(organizationId: string, query = "phone=0790000000") {
  return `/v1/staff/management/organizations/${organizationId}/visit-contacts?${query}`;
}

describe("MGT-BE-08 Visit Contact authorization", () => {
  it("requires STANDARD MFA for Company Admin reads", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
    const auth = await fixture.nativeLogin(user);
    const denied = await fixture.managementGet(search(organizationId), auth.accessToken);
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    await fixture.enrollAndAssure(auth);
    expect((await fixture.managementGet(search(organizationId), auth.accessToken)).status).toBe(200);
  });

  it("honors inactive user, membership and Organization immediately", async () => {
    for (const target of ["USER", "MEMBERSHIP", "ORGANIZATION"] as const) {
      const user = await fixture.createUser();
      const organizationId = await fixture.createOrganization();
      const membershipId = await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
      const auth = await fixture.nativeLogin(user);
      await fixture.enrollAndAssure(auth);
      if (target === "USER") {
        await fixture.query(`UPDATE users SET status='DISABLED' WHERE id=$1`, [user.id]);
      } else if (target === "MEMBERSHIP") {
        await fixture.query(`UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1`,
          [membershipId]);
      } else {
        await fixture.query(`UPDATE organizations SET status='INACTIVE' WHERE id=$1`,
          [organizationId]);
      }
      const response = await fixture.managementGet(search(organizationId), auth.accessToken);
      expect([401, 404]).toContain(response.status);
      expect(response.body?.code).not.toBe("INTERNAL_ERROR");
    }
  });

  it("denies foreign Organization access for both Company Admin and Location Manager", async () => {
    const foreignOrganizationId = await fixture.createOrganization();
    for (const role of ["ORG_ADMIN", "LOCATION_MANAGER"] as const) {
      const user = await fixture.createUser();
      const organizationId = await fixture.createOrganization();
      const membershipId = await fixture.addMembership(organizationId, user.id, role);
      if (role === "LOCATION_MANAGER") {
        const location = await fixture.addLocation(organizationId);
        await fixture.grantLocationAccess(organizationId, membershipId, location.locationId);
      }
      const auth = await fixture.nativeLogin(user);
      if (role === "ORG_ADMIN") await fixture.enrollAndAssure(auth);
      const response = await fixture.managementGet(search(foreignOrganizationId), auth.accessToken);
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
  });

  it("honors session revocation on the next request", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    expect((await fixture.managementGet(search(organizationId), auth.accessToken)).status).toBe(200);
    await fixture.query(`UPDATE staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`,
      [auth.sessionId]);
    expect((await fixture.managementGet(search(organizationId), auth.accessToken)).status).toBe(401);
  });

  it("binds search cursors to mode, Organization, membership and normalized search", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(organizationId, user.id, "LOCATION_MANAGER");
    const location = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(organizationId, membershipId, location.locationId);
    for (const [index, name] of ["Bound A", "Bound B", "Bound C"].entries()) {
      const customerId = await fixture.createCustomer(
        organizationId, `+96279013013${index}`, name,
      );
      const vehicleId = await fixture.createVehicle(organizationId, { plateNumber: `CB-${index}` });
      await fixture.createVisit({ customerId, locationId: location.locationId, membershipId,
        organizationId, vehicleId });
    }
    const auth = await fixture.nativeLogin(user);
    const first = await fixture.managementGet(search(organizationId, "name=Bound&limit=1"),
      auth.accessToken);
    const cursor = String(first.body?.nextCursor);
    expect(first.status).toBe(200);
    expect(cursor).not.toBe("null");
    const last = cursor.at(-1);
    if (last === undefined) throw new Error("Expected search cursor.");
    const tampered = `${cursor.slice(0, -1)}${last === "A" ? "B" : "A"}`;
    for (const path of [
      search(organizationId, `phone=0790130130&limit=1&cursor=${cursor}`),
      search(organizationId, `name=Different&limit=1&cursor=${cursor}`),
      search(await fixture.createOrganization(), `name=Bound&limit=1&cursor=${cursor}`),
      search(organizationId, `name=Bound&limit=1&cursor=${tampered}`),
    ]) {
      const response = await fixture.managementGet(path, auth.accessToken);
      expect([400, 404]).toContain(response.status);
    }

    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [organizationId, membershipId, location.locationId],
    );
    const revoked = await fixture.managementGet(
      search(organizationId, `name=Bound&limit=1&cursor=${cursor}`),
      auth.accessToken,
    );
    expect(revoked.status).toBe(404);
  });
});
