import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementVisitContactTestFixture } from "./management-visit-contact-test-fixture";

const fixture = new ManagementVisitContactTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function searchPath(organizationId: string, query: string): string {
  return `/v1/staff/management/organizations/${organizationId}/visit-contacts?${query}`;
}

async function admin() {
  const user = await fixture.createUser();
  const organizationId = await fixture.createOrganization();
  const membershipId = await fixture.addMembership(organizationId, user.id, "ORG_ADMIN");
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membershipId, organizationId, user };
}

describe("MGT-BE-08 Visit Contact search", () => {
  it("normalizes exact Jordan phone and preserves authorized ambiguity", async () => {
    const actor = await admin();
    const location = await fixture.addLocation(actor.organizationId);
    const vehicleA = await fixture.createVehicle(actor.organizationId, { plateNumber: "11-ABC" });
    const vehicleB = await fixture.createVehicle(actor.organizationId, { plateNumber: "22-ABC" });
    const customerA = await fixture.createCustomer(actor.organizationId, "+962790001111", "Ahmad A");
    const customerB = await fixture.createCustomer(actor.organizationId, "+962790001111", "Ahmad B");
    await fixture.createVisit({ customerId: customerA, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId, vehicleId: vehicleA });
    await fixture.createVisit({ customerId: customerB, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId, vehicleId: vehicleB });

    const response = await fixture.managementGet(
      searchPath(actor.organizationId, `phone=${encodeURIComponent("079 000 1111")}`),
      actor.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ matchState: "AMBIGUOUS", mode: "PHONE" });
    const items = response.body?.items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.customerId).sort()).toEqual([customerA, customerB].sort());
    expect(items[0]?.phone).toEqual({ kind: "FULL", value: "+962790001111" });
  });

  it("keeps Location Manager search, counts, latest visit and vehicles inside current grants", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(organizationId, user.id, "LOCATION_MANAGER");
    const granted = await fixture.addLocation(organizationId);
    const hidden = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(organizationId, membershipId, granted.locationId);
    const visibleVehicle = await fixture.createVehicle(organizationId, { plateNumber: "A-100" });
    const hiddenVehicle = await fixture.createVehicle(organizationId, { plateNumber: "B-200" });
    const customer = await fixture.createCustomer(organizationId, "+962790002222", "Scoped Guest");
    await fixture.createVisit({ customerId: customer, locationId: granted.locationId,
      membershipId, organizationId, vehicleId: visibleVehicle });
    await fixture.createVisit({ customerId: customer, locationId: hidden.locationId,
      membershipId, organizationId, vehicleId: hiddenVehicle });
    const auth = await fixture.nativeLogin(user);

    const response = await fixture.managementGet(
      searchPath(organizationId, `phone=${encodeURIComponent("+962790002222")}`),
      auth.accessToken,
    );
    expect(response.status).toBe(200);
    const item = (response.body?.items as Array<Record<string, unknown>>)[0]!;
    expect(item).toMatchObject({
      completedVisitCount: 1,
      phone: { ending: "2222", kind: "MASKED" },
    });
    expect(item.latestVisit).toMatchObject({ locationId: granted.locationId });
    expect(item.associatedVehicles).toEqual([
      expect.objectContaining({ vehicleId: visibleVehicle }),
    ]);
    expect(JSON.stringify(response.body)).not.toContain(hidden.locationId);
    expect(JSON.stringify(response.body)).not.toContain(hiddenVehicle);

    await fixture.query(
      `DELETE FROM membership_location_access
       WHERE organization_id=$1 AND membership_id=$2 AND location_id=$3`,
      [organizationId, membershipId, granted.locationId],
    );
    const revoked = await fixture.managementGet(
      searchPath(organizationId, `phone=${encodeURIComponent("+962790002222")}`),
      auth.accessToken,
    );
    expect(revoked.status).toBe(404);
    expect(revoked.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("supports exact normalized plate including customerless visits", async () => {
    const actor = await admin();
    const location = await fixture.addLocation(actor.organizationId);
    const vehicleId = await fixture.createVehicle(actor.organizationId, {
      plateCountry: "JO",
      plateNumber: "12 ab-34",
    });
    await fixture.createVisit({ locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId });

    const response = await fixture.managementGet(
      searchPath(actor.organizationId, "plate=12%20AB-34&plateCountry=jo"),
      actor.auth.accessToken,
    );
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ matchState: "UNIQUE", mode: "PLATE" });
    expect(response.body?.items).toEqual([
      expect.objectContaining({ kind: "VEHICLE", vehicleId }),
    ]);
  });

  it("uses bounded Unicode prefix name search without SQL wildcard expansion", async () => {
    const actor = await admin();
    const location = await fixture.addLocation(actor.organizationId);
    const names = ["أحمد سالم", "أحمد يوسف", "A%literal", "AXliteral"];
    for (const [index, name] of names.entries()) {
      const vehicleId = await fixture.createVehicle(actor.organizationId, { plateNumber: `N-${index}` });
      const customerId = await fixture.createCustomer(actor.organizationId,
        `+96279000333${index}`, name);
      await fixture.createVisit({ customerId, locationId: location.locationId,
        membershipId: actor.membershipId, organizationId: actor.organizationId, vehicleId });
    }
    const arabic = await fixture.managementGet(
      searchPath(actor.organizationId, `name=${encodeURIComponent("أحمد")}&limit=1`),
      actor.auth.accessToken,
    );
    expect(arabic.status).toBe(200);
    expect(arabic.body?.items).toHaveLength(1);
    expect(arabic.body?.nextCursor).toEqual(expect.any(String));

    const wildcard = await fixture.managementGet(
      searchPath(actor.organizationId, `name=${encodeURIComponent("A%")}`),
      actor.auth.accessToken,
    );
    expect(wildcard.status).toBe(200);
    expect(wildcard.body?.items).toHaveLength(1);
    expect((wildcard.body?.items as Array<Record<string, unknown>>)[0]?.displayName).toBe("A%literal");
  });

  it("freezes visit evidence and visit-derived facts across search pages", async () => {
    const actor = await admin();
    const location = await fixture.addLocation(actor.organizationId);
    const phone = "+962790004444";
    const customerA = await fixture.createCustomer(actor.organizationId, phone, "Snapshot A",
      "10000000-0000-4000-8000-000000000001");
    const customerB = await fixture.createCustomer(actor.organizationId, phone, "Snapshot B",
      "10000000-0000-4000-8000-000000000002");
    const customerC = await fixture.createCustomer(actor.organizationId, phone, "Snapshot C",
      "10000000-0000-4000-8000-000000000003");
    const vehicleA = await fixture.createVehicle(actor.organizationId, { plateNumber: "S-100" });
    const vehicleB = await fixture.createVehicle(actor.organizationId, { plateNumber: "S-200" });
    await fixture.createVisit({ customerId: customerA, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId, vehicleId: vehicleA });
    const originalVisitB = await fixture.createVisit({ customerId: customerB,
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: vehicleB });

    const first = await fixture.managementGet(
      searchPath(actor.organizationId, `phone=${encodeURIComponent(phone)}&limit=1`),
      actor.auth.accessToken,
    );
    expect(first.status).toBe(200);
    expect(first.body?.items).toEqual([
      expect.objectContaining({ customerId: customerA }),
    ]);
    expect(first.body?.nextCursor).toEqual(expect.any(String));

    const appendedVehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "S-300" });
    await fixture.createVisit({ customerId: customerB, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId,
      vehicleId: appendedVehicle });
    await fixture.createVisit({ customerId: customerC, locationId: location.locationId,
      membershipId: actor.membershipId, organizationId: actor.organizationId,
      vehicleId: appendedVehicle });

    const second = await fixture.managementGet(
      searchPath(actor.organizationId,
        `phone=${encodeURIComponent(phone)}&limit=1&cursor=${encodeURIComponent(String(first.body?.nextCursor))}`),
      actor.auth.accessToken,
    );
    expect(second.status).toBe(200);
    expect(second.body?.items).toEqual([
      expect.objectContaining({
        associatedVehicles: [expect.objectContaining({ vehicleId: vehicleB })],
        completedVisitCount: 1,
        customerId: customerB,
        latestVisit: expect.objectContaining({ valetSessionId: originalVisitB }),
      }),
    ]);
    expect(JSON.stringify(second.body)).not.toContain(appendedVehicle);
    expect(JSON.stringify(second.body)).not.toContain(customerC);
    expect(second.body?.nextCursor).toBeNull();
  });

  it("excludes a matching visit uncommitted at page one and admits it to a fresh search", async () => {
    const actor = await admin();
    const location = await fixture.addLocation(actor.organizationId);
    const phone = "+962790044445";
    const customerA = await fixture.createCustomer(actor.organizationId, phone, "MVCC A",
      "10000000-0000-4000-8000-000000000011");
    const customerB = await fixture.createCustomer(actor.organizationId, phone, "MVCC B",
      "10000000-0000-4000-8000-000000000012");
    const customerC = await fixture.createCustomer(actor.organizationId, phone, "MVCC C",
      "10000000-0000-4000-8000-000000000013");
    const vehicle = await fixture.createVehicle(actor.organizationId, { plateNumber: "MVCC-1" });
    await fixture.createVisit({ customerId: customerA, createdAt: "2026-09-10T10:00:00.000Z",
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: vehicle });
    await fixture.createVisit({ customerId: customerB, createdAt: "2026-09-10T11:00:00.000Z",
      locationId: location.locationId, membershipId: actor.membershipId,
      organizationId: actor.organizationId, vehicleId: vehicle });
    const writerUser = await fixture.createUser();
    const writerMembership = await fixture.addMembership(
      actor.organizationId, writerUser.id, "VALET_EMPLOYEE",
    );

    const lateVisitId = randomUUID();
    const writer = await fixture.databasePool().connect();
    try {
      await writer.query("BEGIN");
      await fixture.createVisitInTransaction(writer, {
        customerId: customerC, createdAt: "2026-09-10T12:00:00.000Z",
        locationId: location.locationId, membershipId: writerMembership,
        organizationId: actor.organizationId, sessionId: lateVisitId, vehicleId: vehicle,
      });

      const first = await fixture.managementGet(
        searchPath(actor.organizationId, `phone=${encodeURIComponent(phone)}&limit=1`),
        actor.auth.accessToken,
      );
      expect(first.status).toBe(200);
      expect(first.body?.items).toEqual([expect.objectContaining({ customerId: customerA })]);
      const cursor = String(first.body?.nextCursor);

      await writer.query("COMMIT");
      const second = await fixture.managementGet(
        searchPath(actor.organizationId,
          `phone=${encodeURIComponent(phone)}&limit=10&cursor=${encodeURIComponent(cursor)}`),
        actor.auth.accessToken,
      );
      expect(second.status).toBe(200);
      expect((second.body?.items as Array<{ customerId: string }>).map((item) => item.customerId))
        .toEqual([customerB]);
      expect(JSON.stringify(second.body)).not.toContain(customerC);

      const fresh = await fixture.managementGet(
        searchPath(actor.organizationId, `phone=${encodeURIComponent(phone)}&limit=10`),
        actor.auth.accessToken,
      );
      expect(fresh.status).toBe(200);
      expect((fresh.body?.items as Array<{ customerId: string }>).map((item) => item.customerId))
        .toEqual([customerA, customerB, customerC]);
    } finally {
      await writer.query("ROLLBACK").catch(() => undefined);
      writer.release();
    }
  });

  it("rejects browse, incompatible modes, unknown keys, partial phone assumptions and bad cursors", async () => {
    const actor = await admin();
    const cases = [
      "limit=10",
      "phone=0790001111&name=Ahmad",
      "name=Ahmad&unknown=x",
      "plate=1234",
      `phone=${encodeURIComponent("+14155552671")}`,
      "name=Ahmad&cursor=not_base64url!",
    ];
    for (const query of cases) {
      const response = await fixture.managementGet(
        searchPath(actor.organizationId, query), actor.auth.accessToken,
      );
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "REQUEST_INVALID" });
    }
  });

  it("denies Supervisor and Employee explorer access with non-disclosing errors", async () => {
    for (const role of ["VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const) {
      const user = await fixture.createUser();
      const organizationId = await fixture.createOrganization();
      await fixture.addMembership(organizationId, user.id, role);
      const auth = await fixture.nativeLogin(user);
      const response = await fixture.managementGet(
        searchPath(organizationId, "phone=0790001111"), auth.accessToken,
      );
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
  });
});
