import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();

beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

function base(locationId: string) {
  return `/v1/staff/dashboard/locations/${locationId}/physical-resources`;
}

async function zone(
  organizationId: string,
  locationId: string,
  code = "ZONE-A",
) {
  const parkingZoneId = randomUUID();
  await fixture.query(
    `INSERT INTO parking_zones(
       id,organization_id,location_id,code,label,status,updated_at)
     VALUES($1,$2,$3,$4,$5,'ACTIVE',clock_timestamp())`,
    [parkingZoneId, organizationId, locationId, code, `Label ${code}`],
  );
  return parkingZoneId;
}

async function assuredAdmin() {
  const user = await fixture.createUser();
  const membership = await fixture.createMembership(user.id);
  const auth = await fixture.nativeLogin(user);
  await fixture.enrollAndAssure(auth);
  return { auth, membership, user };
}

describe("Issue #232 physical-resource Management API", () => {
  it("creates, lists, reconciles, audits and labels Company Admin resources", async () => {
    const admin = await assuredAdmin();
    const location = await fixture.addLocation(admin.membership.organizationId);
    const other = await fixture.addLocation(admin.membership.organizationId);
    const zoneId = await zone(admin.membership.organizationId, location.locationId);
    const otherZoneId = await zone(
      admin.membership.organizationId,
      other.locationId,
      "ZONE-B",
    );
    const operationId = randomUUID();
    const keyBody = { operationId, code: " K-01 " };

    const first = await fixture.managementPost(
      `${base(location.locationId)}/key-slots`,
      admin.auth.accessToken,
      keyBody,
    );
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ code: "K-01", status: "ACTIVE" });
    const keySlotId = String(first.body?.keySlotId);

    const retry = await fixture.managementPost(
      `${base(location.locationId)}/key-slots`,
      admin.auth.accessToken,
      keyBody,
    );
    expect(retry.status).toBe(201);
    expect(retry.body?.keySlotId).toBe(keySlotId);

    const opConflict = await fixture.managementPost(
      `${base(location.locationId)}/key-slots`,
      admin.auth.accessToken,
      { operationId, code: "K-02" },
    );
    expect(opConflict.status).toBe(409);
    expect(opConflict.body).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    const duplicate = await fixture.managementPost(
      `${base(location.locationId)}/key-slots`,
      admin.auth.accessToken,
      { operationId: randomUUID(), code: "K-01" },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ code: "RESOURCE_CODE_CONFLICT" });

    const caseVariant = await fixture.managementPost(
      `${base(location.locationId)}/key-slots`,
      admin.auth.accessToken,
      { operationId: randomUUID(), code: "k-01" },
    );
    expect(caseVariant.status).toBe(201);
    const crossLocation = await fixture.managementPost(
      `${base(other.locationId)}/key-slots`,
      admin.auth.accessToken,
      { operationId: randomUUID(), code: "K-01" },
    );
    expect(crossLocation.status).toBe(201);

    const page1 = await fixture.managementGet(
      `${base(location.locationId)}/key-slots?limit=1`,
      admin.auth.accessToken,
    );
    expect(page1.status).toBe(200);
    expect((page1.body?.items as unknown[])?.length).toBe(1);
    expect(page1.body?.nextCursor).toEqual(expect.any(String));
    const page2 = await fixture.managementGet(
      `${base(location.locationId)}/key-slots?limit=1&cursor=${encodeURIComponent(String(page1.body?.nextCursor))}`,
      admin.auth.accessToken,
    );
    expect(page2.status).toBe(200);

    const label = await fixture.managementGet(
      `${base(location.locationId)}/key-slots/${keySlotId}/label`,
      admin.auth.accessToken,
    );
    expect(label.status).toBe(200);
    expect(label.body).toMatchObject({
      code: "K-01",
      qrPayload: `vaylet:v2:key-slot:${keySlotId}:K-01`,
      resourceId: keySlotId,
      resourceType: "KEY_SLOT",
      version: "V2",
    });

    const spot = await fixture.managementPost(
      `${base(location.locationId)}/parking-spots`,
      admin.auth.accessToken,
      {
        operationId: randomUUID(),
        code: "P-01",
        label: "Front Row 01",
        parkingZoneId: zoneId,
      },
    );
    expect(spot.status).toBe(201);
    expect(spot.body).toMatchObject({
      code: "P-01",
      label: "Front Row 01",
      parkingZone: { parkingZoneId: zoneId, status: "ACTIVE" },
    });
    const wrongZone = await fixture.managementPost(
      `${base(location.locationId)}/parking-spots`,
      admin.auth.accessToken,
      {
        operationId: randomUUID(),
        code: "P-02",
        label: "Front Row 02",
        parkingZoneId: otherZoneId,
      },
    );
    expect(wrongZone.status).toBe(409);
    expect(wrongZone.body).toMatchObject({ code: "PARKING_ZONE_INVALID" });

    const audit = await fixture.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE organization_id=$1 AND location_id=$2
         AND event_type='KEY_SLOT_CREATED' AND idempotency_key=$3`,
      [admin.membership.organizationId, location.locationId, operationId],
    );
    expect(audit.rows[0]?.count).toBe("1");
  });

  it("lets an exact granted Location Manager create without new MFA", async () => {
    const user = await fixture.createUser();
    const organizationId = await fixture.createOrganization();
    const membershipId = await fixture.addMembership(
      organizationId,
      user.id,
      "LOCATION_MANAGER",
    );
    const granted = await fixture.addLocation(organizationId);
    const other = await fixture.addLocation(organizationId);
    await fixture.grantLocationAccess(organizationId, membershipId, granted.locationId);
    const auth = await fixture.nativeLogin(user);
    const created = await fixture.managementPost(
      `${base(granted.locationId)}/key-slots`,
      auth.accessToken,
      { operationId: randomUUID(), code: "LM-01" },
    );
    expect(created.status).toBe(201);
    const denied = await fixture.managementGet(
      `${base(other.locationId)}/key-slots`,
      auth.accessToken,
    );
    expect(denied.status).toBe(404);
    expect(denied.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
});
