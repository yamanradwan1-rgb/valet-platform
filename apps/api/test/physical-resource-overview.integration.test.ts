import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();
const url = (id: string) =>
  `/v1/staff/dashboard/locations/${id}/physical-resources`;

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Issue #304 scoped authoritative resource overview", () => {
  it("derives six full Location counts independently of pages and projects real custody", async () => {
    const user = await fixture.createUser();
    const admin = await fixture.createMembership(user.id);
    const location = await fixture.addLocation(admin.organizationId);
    const other = await fixture.addLocation(admin.organizationId);
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);

    const keyResponse = await fixture.managementPost(
      `${url(location.locationId)}/key-slots`,
      auth.accessToken,
      { operationId: randomUUID(), code: "K-01", label: "Front desk" },
    );
    expect(keyResponse.status).toBe(201);
    expect(keyResponse.body?.label).toBe("Front desk");
    const keySlotId = String(keyResponse.body?.keySlotId);
    const secondSlot = randomUUID();
    const inactiveSlot = randomUUID();
    await fixture.query(
      `INSERT INTO key_slots(id,organization_id,location_id,code,status,updated_at)
       VALUES ($1,$3,$4,'K-02','ACTIVE',clock_timestamp()),
              ($2,$3,$4,'K-03','INACTIVE',clock_timestamp())`,
      [secondSlot, inactiveSlot, admin.organizationId, location.locationId],
    );
    const zoneId = randomUUID();
    await fixture.query(
      `INSERT INTO parking_zones(id,organization_id,location_id,code,label,status,updated_at)
       VALUES ($1,$2,$3,'Z-A','Zone A','ACTIVE',clock_timestamp())`,
      [zoneId, admin.organizationId, location.locationId],
    );
    const spotId = randomUUID(),
      freeSpotId = randomUUID(),
      inactiveSpotId = randomUUID();
    await fixture.query(
      `INSERT INTO parking_spots
         (id,organization_id,location_id,parking_zone_id,code,label,status,updated_at)
       VALUES ($1,$4,$5,$6,'P-01','Bay 1','ACTIVE',clock_timestamp()),
              ($2,$4,$5,$6,'P-02','Bay 2','ACTIVE',clock_timestamp()),
              ($3,$4,$5,$6,'P-03','Bay 3','INACTIVE',clock_timestamp())`,
      [
        spotId,
        freeSpotId,
        inactiveSpotId,
        admin.organizationId,
        location.locationId,
        zoneId,
      ],
    );
    const vehicleId = randomUUID();
    await fixture.query(
      `INSERT INTO vehicles
         (id,organization_id,plate_country,plate_number_raw,plate_number_normalized,updated_at)
       VALUES ($1,$2,'JO','DEMO-304','DEMO304',clock_timestamp())`,
      [vehicleId, admin.organizationId],
    );
    const sessionId = randomUUID();
    await fixture.query(
      `INSERT INTO valet_sessions
         (id,customer_access_token_hash,customer_access_expires_at,
          organization_id,location_id,vehicle_id,state,parking_zone_id,
          parking_spot_id,key_slot_id,checked_in_by_membership_id,updated_at)
       VALUES ($1,$2,clock_timestamp()+interval '1 day',
               $3,$4,$5,'PARKED',$6,$7,$8,$9,clock_timestamp())`,
      [
        sessionId,
        randomUUID(),
        admin.organizationId,
        location.locationId,
        vehicleId,
        zoneId,
        spotId,
        keySlotId,
        admin.membershipId,
      ],
    );
    await fixture.query(
      `INSERT INTO key_custody_events
         (id,organization_id,location_id,valet_session_id,key_slot_id,
          actor_membership_id,event_type)
       VALUES ($1,$2,$3,$4,$5,$6,'SLOT_ASSIGNED')`,
      [
        randomUUID(),
        admin.organizationId,
        location.locationId,
        sessionId,
        keySlotId,
        admin.membershipId,
      ],
    );

    const first = await fixture.managementGet(
      `${url(location.locationId)}/overview?limit=1`,
      auth.accessToken,
    );
    expect(first.status).toBe(200);
    expect(first.body?.counts).toEqual({
      keySlots: {
        configured: 3,
        active: 2,
        available: 1,
        inUse: 1,
        unknown: 1,
      },
      parkingSpots: {
        configured: 3,
        active: 2,
        available: 1,
        occupied: 1,
        unknown: 1,
      },
    });
    expect((first.body?.keySlots as { items: unknown[] }).items).toHaveLength(
      1,
    );
    expect(first.body?.keySlots).toHaveProperty(
      "nextCursor",
      expect.any(String),
    );
    expect(first.body?.parkingSpots).toHaveProperty(
      "nextCursor",
      expect.any(String),
    );
    const full = await fixture.managementGet(
      `${url(location.locationId)}/overview?limit=10`,
      auth.accessToken,
    );
    expect(full.status).toBe(200);
    expect(full.body?.counts).toEqual(first.body?.counts);
    expect(
      (full.body?.keySlots as { items: Record<string, unknown>[] }).items,
    ).toContainEqual(
      expect.objectContaining({
        code: "K-01",
        label: "Front desk",
        usage: "IN_USE",
        holdingSessionId: sessionId,
        holdingVehicle: {
          plateNumberNormalized: "DEMO304",
          temporaryDescriptor: null,
        },
      }),
    );
    expect(
      (full.body?.parkingSpots as { items: Record<string, unknown>[] }).items,
    ).toContainEqual(
      expect.objectContaining({ code: "P-01", usage: "OCCUPIED" }),
    );
    const history = await fixture.managementGet(
      `${url(location.locationId)}/key-slots/${keySlotId}/custody`,
      auth.accessToken,
    );
    expect(history.status).toBe(200);
    expect(history.body?.items).toEqual([
      expect.objectContaining({
        eventType: "SLOT_ASSIGNED",
        actorMembershipId: admin.membershipId,
      }),
    ]);

    const foreign = await fixture.managementGet(
      `${url(other.locationId)}/key-slots/${keySlotId}/custody`,
      auth.accessToken,
    );
    expect(foreign.status).toBe(404);
    await fixture.query(
      "UPDATE locations SET status='INACTIVE',accepting_intake=FALSE WHERE id=$1",
      [location.locationId],
    );
    const inactive = await fixture.managementGet(
      `${url(location.locationId)}/overview?limit=10`,
      auth.accessToken,
    );
    expect(inactive.status).toBe(200);
    expect(inactive.body?.counts).toEqual({
      keySlots: {
        configured: 3,
        active: 2,
        available: null,
        inUse: null,
        unknown: 3,
      },
      parkingSpots: {
        configured: 3,
        active: 2,
        available: null,
        occupied: null,
        unknown: 3,
      },
    });
    expect(
      (inactive.body?.keySlots as { items: { usage: string }[] }).items.every(
        (item) => item.usage === "UNKNOWN",
      ),
    ).toBe(true);
  });

  it("enforces Standard MFA, Location Manager grant and role denial", async () => {
    const user = await fixture.createUser();
    const admin = await fixture.createMembership(user.id);
    const location = await fixture.addLocation(admin.organizationId);
    const auth = await fixture.nativeLogin(user);
    const noMfa = await fixture.managementGet(
      `${url(location.locationId)}/overview`,
      auth.accessToken,
    );
    expect(noMfa.status).toBe(403);
    expect(noMfa.body).toMatchObject({ code: "MFA_STEP_UP_REQUIRED" });
    await fixture.enrollAndAssure(auth);
    expect(
      (
        await fixture.managementGet(
          `${url(location.locationId)}/overview`,
          auth.accessToken,
        )
      ).status,
    ).toBe(200);
    const manager = await fixture.createUser();
    const membershipId = await fixture.addMembership(
      admin.organizationId,
      manager.id,
      "LOCATION_MANAGER",
    );
    const managerAuth = await fixture.nativeLogin(manager);
    expect(
      (
        await fixture.managementGet(
          `${url(location.locationId)}/overview`,
          managerAuth.accessToken,
        )
      ).status,
    ).toBe(404);
    await fixture.grantLocationAccess(
      admin.organizationId,
      membershipId,
      location.locationId,
    );
    expect(
      (
        await fixture.managementGet(
          `${url(location.locationId)}/overview`,
          managerAuth.accessToken,
        )
      ).status,
    ).toBe(200);
  });
});
