import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

const fixture = new ManagementVisitContactTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("MGT-BE-08 Visit Contact privacy", () => {
  it("returns only the bounded safe search/history projection and does not audit reads", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
    const location = await fixture.addLocation(organizationId);
    const customerId = await fixture.createCustomer(organizationId, "+962790140140", "Privacy Guest");
    const vehicleId = await fixture.createVehicle(organizationId, { plateNumber: "PV-140" });
    await fixture.createVisit({ customerId, locationId: location.locationId, membershipId,
      organizationId, vehicleId });
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const search = await fixture.managementGet(
      `/v1/staff/management/organizations/${organizationId}/visit-contacts?phone=0790140140`,
      auth.accessToken,
    );
    const history = await fixture.managementGet(
      `/v1/staff/management/organizations/${organizationId}/visit-contacts/${customerId}/visits`,
      auth.accessToken,
    );
    expect(search.status).toBe(200);
    expect(history.status).toBe(200);
    const serialized = JSON.stringify([search.body, history.body]);
    for (const forbidden of [
      "customer_access_token_hash",
      "customerAccessTokenHash",
      "customer_access_expires_at",
      "customer_access_revoked_at",
      "pickup",
      "otp",
      "qrSecret",
      "providerPayload",
      "latitude",
      "longitude",
      "routeSamples",
      "employee",
      "metadataJson",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect((await fixture.eventRows(organizationId)).rows).toHaveLength(0);
  });

  it("does not expose hidden Location ambiguity or counts to Location Manager", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(organizationId, user.id, "LOCATION_MANAGER");
    const visible = await fixture.addLocation(organizationId);
    const hidden = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(organizationId, membershipId, visible.locationId);
    const visibleCustomer = await fixture.createCustomer(organizationId, "+962790150150", "Visible");
    const hiddenCustomer = await fixture.createCustomer(organizationId, "+962790150150", "Hidden");
    const visibleVehicle = await fixture.createVehicle(organizationId, { plateNumber: "PV-150" });
    const hiddenVehicle = await fixture.createVehicle(organizationId, { plateNumber: "PH-150" });
    await fixture.createVisit({ customerId: visibleCustomer, locationId: visible.locationId,
      membershipId, organizationId, vehicleId: visibleVehicle });
    await fixture.createVisit({ customerId: hiddenCustomer, locationId: hidden.locationId,
      membershipId, organizationId, vehicleId: hiddenVehicle });
    const auth = await fixture.nativeLogin(user);
    const response = await fixture.managementGet(
      `/v1/staff/management/organizations/${organizationId}/visit-contacts?phone=0790150150`,
      auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ matchState: "UNIQUE" });
    expect(response.body?.items).toHaveLength(1);
    expect(response.body?.items).toEqual([
      expect.objectContaining({ customerId: visibleCustomer, completedVisitCount: 1 }),
    ]);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(hiddenCustomer);
    expect(serialized).not.toContain(hidden.locationId);
    expect(serialized).not.toContain(hiddenVehicle);

    const adminUser = await fixture.createUser();
    await fixture.addMembership(organizationId, adminUser.id, "ORG_ADMIN");
    const adminAuth = await fixture.nativeLogin(adminUser);
    await fixture.enrollAndAssure(adminAuth);
    const adminResponse = await fixture.managementGet(
      `/v1/staff/management/organizations/${organizationId}/visit-contacts?phone=0790150150`,
      adminAuth.accessToken,
    );
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body).toMatchObject({ matchState: "AMBIGUOUS" });
    expect(adminResponse.body?.items).toHaveLength(2);
  });
});
