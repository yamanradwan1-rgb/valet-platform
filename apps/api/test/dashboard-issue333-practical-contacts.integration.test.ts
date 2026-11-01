import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  contacts,
  practicalContactScenario,
  practicalRevoke,
  startPracticalContacts,
  stopPracticalContacts,
} from "./dashboard-issue333-practical-contact-fixture";

const search = (organizationId: string, query: string) =>
  `/v1/staff/management/organizations/${organizationId}/visit-contacts?${query}`;
const history = (
  organizationId: string,
  kind: "contact" | "vehicle",
  id: string,
) =>
  `/v1/staff/management/organizations/${organizationId}/${kind === "contact" ? "visit-contacts" : "visit-vehicles"}/${id}/visits`;

beforeAll(startPracticalContacts, 180_000);
afterEach(() => contacts.resetLimits());
afterAll(stopPracticalContacts, 90_000);

describe("Issue #333 practical Visit Contacts after committed LocationAccess revoke", () => {
  it("recomputes A+B count/latest/vehicles/plate and both histories from B only", async () => {
    const s = await practicalContactScenario();
    const customerId = await contacts.createCustomer(
      s.organizationId,
      "+962790333901",
      "Practical Shared",
    );
    const onlyA = await contacts.createVehicle(s.organizationId, {
      plateNumber: "P333-ONLY-A",
    });
    const shared = await contacts.createVehicle(s.organizationId, {
      plateNumber: "P333-SHARED",
    });
    const createVisit = (
      locationId: string,
      vehicleId: string,
      createdAt: string,
    ) =>
      contacts.createVisit({
        customerId,
        createdAt,
        locationId,
        membershipId: s.membershipId,
        organizationId: s.organizationId,
        vehicleId,
      });
    const aOlder = await createVisit(s.a, onlyA, "2026-10-28T10:00:00Z");
    const bVisit = await createVisit(s.b, shared, "2026-10-29T10:00:00Z");
    const aLatest = await createVisit(s.a, shared, "2026-10-30T10:00:00Z");
    const byName = search(s.organizationId, "name=Practical%20Shared");
    const byPlate = search(
      s.organizationId,
      "plate=P333-SHARED&plateCountry=JO",
    );
    const customerHistory = history(s.organizationId, "contact", customerId);
    const vehicleHistory = history(s.organizationId, "vehicle", shared);
    const before = await contacts.managementGet(byName, s.manager.accessToken);
    expect(before.status).toBe(200);
    expect(before.body?.items).toEqual([
      expect.objectContaining({
        completedVisitCount: 3,
        latestVisit: expect.objectContaining({ valetSessionId: aLatest }),
        associatedVehicles: expect.arrayContaining([
          expect.objectContaining({ vehicleId: onlyA }),
          expect.objectContaining({ vehicleId: shared }),
        ]),
      }),
    ]);
    expect(
      (await contacts.managementGet(byPlate, s.manager.accessToken)).body
        ?.items,
    ).toEqual([expect.objectContaining({ completedVisitCount: 2 })]);

    await practicalRevoke(s);
    const fresh = await contacts.managementGet(byName, s.manager.accessToken);
    expect(fresh.status).toBe(200);
    expect(fresh.body?.items).toEqual([
      expect.objectContaining({
        completedVisitCount: 1,
        latestVisit: expect.objectContaining({
          locationId: s.b,
          valetSessionId: bVisit,
        }),
        associatedVehicles: [expect.objectContaining({ vehicleId: shared })],
      }),
    ]);
    const plate = await contacts.managementGet(byPlate, s.manager.accessToken);
    expect(plate.status).toBe(200);
    expect(plate.body?.items).toEqual([
      expect.objectContaining({
        completedVisitCount: 1,
        latestVisit: expect.objectContaining({ valetSessionId: bVisit }),
      }),
    ]);
    for (const path of [customerHistory, vehicleHistory]) {
      const response = await contacts.managementGet(
        path,
        s.manager.accessToken,
      );
      expect(response.status).toBe(200);
      expect(response.body?.items).toEqual([
        expect.objectContaining({
          locationId: s.b,
          returningContact: false,
          valetSessionId: bVisit,
        }),
      ]);
      expect(JSON.stringify(response.body)).not.toContain(aLatest);
      expect(JSON.stringify(response.body)).not.toContain(aOlder);
    }
    const aPlate = await contacts.managementGet(
      search(s.organizationId, "plate=P333-ONLY-A&plateCountry=JO"),
      s.manager.accessToken,
    );
    expect(aPlate.body?.items).toEqual([]);
    for (const body of [fresh.body, plate.body]) {
      expect(JSON.stringify(body)).not.toContain(s.a);
      expect(JSON.stringify(body)).not.toContain(onlyA);
    }
  }, 35_000);

  it("reauthorizes a pre-revoke search cursor and omits A, ungranted and foreign records", async () => {
    const s = await practicalContactScenario();
    const hidden = (await contacts.addLocation(s.organizationId)).locationId;
    const foreignOrg = await contacts.createOrganization();
    const foreignLocation = (await contacts.addLocation(foreignOrg)).locationId;
    const foreignUser = await contacts.createUser();
    const foreignMembership = await contacts.addMembership(
      foreignOrg,
      foreignUser.id,
      "VALET_EMPLOYEE",
    );
    const cases = [
      {
        id: "00000000-0000-4000-8000-000000001001",
        name: "Practical Cursor A",
        loc: s.a,
        org: s.organizationId,
        member: s.membershipId,
      },
      {
        id: "00000000-0000-4000-8000-000000001002",
        name: "Practical Cursor B",
        loc: s.b,
        org: s.organizationId,
        member: s.membershipId,
      },
      {
        id: "00000000-0000-4000-8000-000000001003",
        name: "Practical Cursor Hidden",
        loc: hidden,
        org: s.organizationId,
        member: s.membershipId,
      },
      {
        id: "00000000-0000-4000-8000-000000001004",
        name: "Practical Cursor Foreign",
        loc: foreignLocation,
        org: foreignOrg,
        member: foreignMembership,
      },
    ] as const;
    for (const [index, item] of cases.entries()) {
      const customer = await contacts.createCustomer(
        item.org,
        `+96279033392${index}`,
        item.name,
        item.id,
      );
      const vehicle = await contacts.createVehicle(item.org, {
        plateNumber: `P333-CURSOR-${index}`,
      });
      await contacts.createVisit({
        customerId: customer,
        locationId: item.loc,
        membershipId: item.member,
        organizationId: item.org,
        vehicleId: vehicle,
      });
    }
    const first = await contacts.managementGet(
      search(s.organizationId, "name=Practical%20Cursor&limit=1"),
      s.manager.accessToken,
    );
    expect(first.status).toBe(200);
    expect(first.body?.items).toEqual([
      expect.objectContaining({ customerId: cases[0]!.id }),
    ]);
    const cursor = first.body?.nextCursor;
    expect(cursor).toEqual(expect.any(String));
    await practicalRevoke(s);
    const page = await contacts.managementGet(
      search(
        s.organizationId,
        `name=Practical%20Cursor&limit=10&cursor=${encodeURIComponent(String(cursor))}`,
      ),
      s.manager.accessToken,
    );
    expect(page.status).toBe(200);
    expect(page.body?.items).toEqual([
      expect.objectContaining({ customerId: cases[1]!.id }),
    ]);
    const fresh = await contacts.managementGet(
      search(s.organizationId, "name=Practical%20Cursor"),
      s.manager.accessToken,
    );
    expect(fresh.status).toBe(200);
    expect(fresh.body?.items).toEqual([
      expect.objectContaining({ customerId: cases[1]!.id }),
    ]);
    const foreign = await contacts.managementGet(
      search(foreignOrg, "name=Practical%20Cursor"),
      s.manager.accessToken,
    );
    expect(foreign.status).toBe(404);
    for (const body of [page.body, fresh.body, foreign.body]) {
      const text = JSON.stringify(body);
      for (const denied of [cases[0]!.id, cases[2]!.id, cases[3]!.id]) {
        expect(text).not.toContain(denied);
      }
    }
  }, 35_000);

  it("keeps Supervisor outside Visit Contacts even with Shift and enforces CA MFA", async () => {
    const s = await practicalContactScenario();
    const customerId = await contacts.createCustomer(
      s.organizationId,
      "+962790333930",
      "Practical Role",
    );
    const vehicleId = await contacts.createVehicle(s.organizationId, {
      plateNumber: "P333-ROLE",
    });
    await contacts.createVisit({
      customerId,
      locationId: s.b,
      membershipId: s.membershipId,
      organizationId: s.organizationId,
      vehicleId,
    });
    const supervisor = await contacts.createUser();
    const supervisorMembership = await contacts.addMembership(
      s.organizationId,
      supervisor.id,
      "VALET_SUPERVISOR",
    );
    await contacts.grantLocationAccess(
      s.organizationId,
      supervisorMembership,
      s.b,
    );
    await contacts.startActiveShift(
      s.organizationId,
      s.b,
      supervisorMembership,
    );
    const supervisorAuth = await contacts.nativeLogin(supervisor);
    const path = search(s.organizationId, "name=Practical%20Role");
    expect(
      (await contacts.managementGet(path, supervisorAuth.accessToken)).status,
    ).toBe(404);
    const passwordOnlyAdmin = await contacts.createUser();
    await contacts.addMembership(
      s.organizationId,
      passwordOnlyAdmin.id,
      "ORG_ADMIN",
    );
    const adminAuth = await contacts.nativeLogin(passwordOnlyAdmin);
    expect(
      (await contacts.managementGet(path, adminAuth.accessToken)).status,
    ).toBe(403);
    await contacts.enrollAndAssure(adminAuth);
    const result = await contacts.managementGet(path, adminAuth.accessToken);
    expect(result.status).toBe(200);
    expect(result.body?.items).toEqual([
      expect.objectContaining({ customerId }),
    ]);
  }, 35_000);
});
