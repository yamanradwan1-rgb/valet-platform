import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { raceWithCanonicalRevoke } from "./issue333-w4-visit-contact-race";
import { startIssue333W4PrivateLab } from "./issue333-w4-private-lab";
import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

const fixture = new ManagementVisitContactTestFixture();
let started = false;

beforeAll(async () => {
  await startIssue333W4PrivateLab(fixture, () => {
    started = true;
  });
}, 180_000);
afterAll(async () => {
  vi.restoreAllMocks();
  if (started) await fixture.stop();
}, 90_000);

describe("Issue333 P001 private mixed-Location aggregate RED characterization", () => {
  it("rejects A aggregate/vehicle data from an A+B response delivered after revoke", async () => {
    const organizationId = await fixture.createOrganization();
    const lmUser = await fixture.createUser();
    const lmMembershipId = await fixture.addMembership(
      organizationId,
      lmUser.id,
      "LOCATION_MANAGER",
    );
    const grantedA = (await fixture.addLocation(organizationId)).locationId;
    const grantedB = (await fixture.addLocation(organizationId)).locationId;
    const admin = await fixture.createUser();
    await fixture.addMembership(organizationId, admin.id, "ORG_ADMIN");
    const adminAuth = await fixture.nativeLogin(admin);
    await fixture.enrollAndAssure(adminAuth);
    const grant = await fixture.managementPost(
      `/v1/staff/management/organizations/${organizationId}/staff/${lmMembershipId}/location-access/grant`,
      adminAuth.accessToken,
      { expectedVersion: 1, locationIds: [grantedA, grantedB] },
    );
    expect(grant.status).toBe(201);
    const lmAuth = await fixture.nativeLogin(lmUser);
    const customerId = await fixture.createCustomer(
      organizationId,
      "+962790331011",
      "W4P001SHARED",
    );
    const vehicleA = await fixture.createVehicle(organizationId, {
      plateNumber: "W4-P001-A",
    });
    const vehicleB = await fixture.createVehicle(organizationId, {
      plateNumber: "W4-P001-B",
    });
    await fixture.createVisit({
      customerId,
      locationId: grantedA,
      membershipId: lmMembershipId,
      organizationId,
      vehicleId: vehicleA,
      createdAt: "2026-10-30T10:00:00Z",
    });
    await fixture.createVisit({
      customerId,
      locationId: grantedB,
      membershipId: lmMembershipId,
      organizationId,
      vehicleId: vehicleB,
      createdAt: "2026-10-31T10:00:00Z",
    });
    await raceWithCanonicalRevoke(
      fixture,
      {
        organizationId,
        grantedA,
        lmMembershipId,
        lmToken: lmAuth.accessToken,
        adminToken: adminAuth.accessToken,
      },
      `/v1/staff/management/organizations/${organizationId}/visit-contacts?name=W4P001SHARED`,
      "W4-P001-A",
      (previous, fresh) => {
        expect(previous).toContain('"completedVisitCount":2');
        expect(previous).toContain("W4-P001-B");
        expect(fresh).toContain('"completedVisitCount":1');
        expect(fresh).toContain("W4-P001-B");
        expect(fresh).not.toContain("W4-P001-A");
      },
    );
  }, 30_000);
});
