import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

const fixture = new ManagementVisitContactTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function customerHistory(organizationId: string, customerId: string, query = "") {
  return `/v1/staff/management/organizations/${organizationId}/visit-contacts/${customerId}/visits${query}`;
}

async function createActor(role: "ORG_ADMIN" | "LOCATION_MANAGER") {
  const user = await fixture.createUser();
  const organizationId = await fixture.createOrganization();
  const membershipId = await fixture.addMembership(organizationId, user.id, role);
  const auth = await fixture.nativeLogin(user);
  if (role === "ORG_ADMIN") await fixture.enrollAndAssure(auth);
  return { auth, membershipId, organizationId };
}

describe("MGT-BE-08 Visit Contact history and Returning Contact", () => {
  it("detects prior completed normalized contact across distinct Customer rows", async () => {
    const actor = await createActor("ORG_ADMIN");
    const location = await fixture.addLocation(actor.organizationId);
    const priorCustomer = await fixture.createCustomer(actor.organizationId, "+962790010101", "Earlier");
    const currentCustomer = await fixture.createCustomer(actor.organizationId, "+962790010101", "Current");
    const priorVehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "RET-1" });
    const currentVehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "RET-2" });
    await fixture.createVisit({ customerId: priorCustomer, createdAt: "2026-09-01T10:00:00.000Z",
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: priorVehicle });
    const currentVisit = await fixture.createVisit({ customerId: currentCustomer,
      createdAt: "2026-09-02T10:00:00.000Z", locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId,
      vehicleId: currentVehicle });

    const response = await fixture.managementGet(
      customerHistory(actor.organizationId, currentCustomer), actor.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.items).toEqual([
      expect.objectContaining({ returningContact: true, valetSessionId: currentVisit }),
    ]);
  });

  it("does not count non-completed, future, or plate-only history", async () => {
    const actor = await createActor("ORG_ADMIN");
    const location = await fixture.addLocation(actor.organizationId);
    const customer = await fixture.createCustomer(actor.organizationId, "+962790020202", "Chronology");
    const other = await fixture.createCustomer(actor.organizationId, "+962790020203", "Other phone");
    const sharedPlateVehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "ONLY-1" });
    const currentVehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "ONLY-2" });
    await fixture.createVisit({ customerId: customer, createdAt: "2026-09-01T08:00:00.000Z",
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, state: "PARKED", vehicleId: currentVehicle });
    await fixture.createVisit({ customerId: other, createdAt: "2026-09-01T09:00:00.000Z",
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: sharedPlateVehicle });
    const currentVisit = await fixture.createVisit({ customerId: customer,
      createdAt: "2026-09-02T08:00:00.000Z", locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId,
      vehicleId: sharedPlateVehicle });
    await fixture.createVisit({ customerId: customer, createdAt: "2026-09-03T08:00:00.000Z",
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: currentVehicle });

    const response = await fixture.managementGet(
      customerHistory(actor.organizationId, customer), actor.auth.accessToken,
    );
    expect(response.status).toBe(200);
    const items = response.body?.items as Array<Record<string, unknown>>;
    const current = items.find((item) => item.valetSessionId === currentVisit);
    expect(current?.returningContact).toBe(false);
  });

  it("uses deterministic id ordering when chronology timestamps tie", async () => {
    const actor = await createActor("ORG_ADMIN");
    const location = await fixture.addLocation(actor.organizationId);
    const customer = await fixture.createCustomer(actor.organizationId, "+962790030303", "Tie");
    const vehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "TIE-1" });
    const earlierId = "00000000-0000-4000-8000-000000000001";
    const laterId = "00000000-0000-4000-8000-000000000002";
    const at = "2026-09-05T10:00:00.000Z";
    await fixture.createVisit({ customerId: customer, createdAt: at, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId,
      sessionId: earlierId, vehicleId: vehicle });
    await fixture.createVisit({ customerId: customer, createdAt: at, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId,
      sessionId: laterId, vehicleId: vehicle });

    const response = await fixture.managementGet(
      customerHistory(actor.organizationId, customer), actor.auth.accessToken,
    );
    expect(response.status).toBe(200);
    const items = response.body?.items as Array<Record<string, unknown>>;
    expect(items.map((item) => item.valetSessionId)).toEqual([laterId, earlierId]);
    expect(items.map((item) => item.returningContact)).toEqual([true, false]);
  });

  it("keeps Returning Contact and history inside LM authorized Locations", async () => {
    const actor = await createActor("LOCATION_MANAGER");
    const granted = await fixture.addLocation(actor.organizationId);
    const hidden = await fixture.addLocation(actor.organizationId);
    await fixture.grantLocationAccess(actor.organizationId, actor.membershipId, granted.locationId);
    const customer = await fixture.createCustomer(actor.organizationId, "+962790040404", "Scoped");
    const vehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "SC-1" });
    await fixture.createVisit({ customerId: customer, createdAt: "2026-09-01T10:00:00.000Z",
      locationId: hidden.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: vehicle });
    const visible = await fixture.createVisit({ customerId: customer,
      createdAt: "2026-09-02T10:00:00.000Z", locationId: granted.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId, vehicleId: vehicle });

    const response = await fixture.managementGet(
      customerHistory(actor.organizationId, customer), actor.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body?.items).toEqual([
      expect.objectContaining({ returningContact: false, valetSessionId: visible }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain(hidden.locationId);

    await fixture.query(`UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1`,
      [granted.locationId]);
    expect((await fixture.managementGet(customerHistory(actor.organizationId, customer),
      actor.auth.accessToken)).status).toBe(200);
  });

  it("keeps a history snapshot stable and reauthorizes page 2", async () => {
    const actor = await createActor("LOCATION_MANAGER");
    const location = await fixture.addLocation(actor.organizationId);
    await fixture.grantLocationAccess(actor.organizationId, actor.membershipId, location.locationId);
    const customer = await fixture.createCustomer(actor.organizationId, "+962790050505", "Paging");
    const vehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "P-1" });
    for (const at of ["2026-09-01T10:00:00.000Z", "2026-09-02T10:00:00.000Z", "2026-09-03T10:00:00.000Z"]) {
      await fixture.createVisit({ customerId: customer, createdAt: at,
        locationId: location.locationId, membershipId: actor.membershipId,
        organizationId: actor.organizationId, vehicleId: vehicle });
    }
    const first = await fixture.managementGet(
      customerHistory(actor.organizationId, customer, "?limit=1"), actor.auth.accessToken,
    );
    expect(first.status).toBe(200);
    const cursor = String(first.body?.nextCursor);
    await fixture.createVisit({ customerId: customer, createdAt: new Date(Date.now() + 60_000).toISOString(),
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: vehicle });
    const second = await fixture.managementGet(
      customerHistory(actor.organizationId, customer, `?limit=1&cursor=${cursor}`), actor.auth.accessToken,
    );
    expect(second.status).toBe(200);
    expect(second.body?.items).toHaveLength(1);

    await fixture.query(`DELETE FROM membership_location_access
      WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [actor.organizationId, actor.membershipId, location.locationId]);
    const revoked = await fixture.managementGet(
      customerHistory(actor.organizationId, customer, `?limit=1&cursor=${cursor}`), actor.auth.accessToken,
    );
    expect(revoked.status).toBe(404);
  });

  it("rejects malformed and subject-crossover cursors", async () => {
    const actor = await createActor("ORG_ADMIN");
    const location = await fixture.addLocation(actor.organizationId);
    const customer = await fixture.createCustomer(actor.organizationId, "+962790060606", "Cursor");
    const vehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "C-1" });
    await fixture.createVisit({ customerId: customer, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId, vehicleId: vehicle });
    await fixture.createVisit({ customerId: customer, createdAt: "2026-09-01T10:00:00.000Z",
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: vehicle });
    const page = await fixture.managementGet(
      customerHistory(actor.organizationId, customer, "?limit=1"), actor.auth.accessToken,
    );
    const cursor = String(page.body?.nextCursor);
    const otherCustomer = randomUUID();
    const crossed = await fixture.managementGet(
      customerHistory(actor.organizationId, otherCustomer, `?limit=1&cursor=${cursor}`),
      actor.auth.accessToken,
    );
    expect(crossed.status).toBe(400);
    expect((await fixture.managementGet(
      customerHistory(actor.organizationId, customer, "?cursor=bad!"),
      actor.auth.accessToken,
    )).status).toBe(400);
  });
});
