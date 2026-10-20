import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ManagementAuditTestFixture } from "./management-audit-test-fixture";

const fixture = new ManagementAuditTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Issue #304 server-side resource filters across cursor pages", () => {
  it("finds page-three-only matches without client-side empty-page hopping", async () => {
    const user = await fixture.createUser();
    const admin = await fixture.createMembership(user.id);
    const location = await fixture.addLocation(admin.organizationId);
    const auth = await fixture.nativeLogin(user);
    await fixture.enrollAndAssure(auth);
    const base = `/v1/staff/dashboard/locations/${location.locationId}/physical-resources/overview`;
    const zoneId = randomUUID();
    await fixture.query(
      `INSERT INTO parking_zones(id,organization_id,location_id,code,label,status,updated_at)
       VALUES($1,$2,$3,'Z-F','Filter zone','ACTIVE',clock_timestamp())`,
      [zoneId, admin.organizationId, location.locationId],
    );
    await fixture.query(
      `INSERT INTO key_slots(id,organization_id,location_id,code,status,updated_at)
       SELECT gen_random_uuid(),$1,$2,'K-'||lpad(n::text,3,'0'),
         (CASE WHEN n IN (112,119) THEN 'INACTIVE' ELSE 'ACTIVE' END)::key_slot_status,
         clock_timestamp()
       FROM generate_series(1,125) AS n`,
      [admin.organizationId, location.locationId],
    );
    await fixture.query(
      `INSERT INTO parking_spots
         (id,organization_id,location_id,parking_zone_id,code,label,status,updated_at)
       SELECT gen_random_uuid(),$1,$2,$3,'P-'||lpad(n::text,3,'0'),
         'Bay '||n,
         (CASE WHEN n IN (112,119) THEN 'INACTIVE' ELSE 'ACTIVE' END)::parking_spot_status,
         clock_timestamp()
       FROM generate_series(1,125) AS n`,
      [admin.organizationId, location.locationId, zoneId],
    );
    const key = await fixture.query<{ id: string }>(
      `SELECT id::text AS id FROM key_slots WHERE location_id=$1 AND code='K-115'`,
      [location.locationId],
    );
    const spot = await fixture.query<{ id: string }>(
      `SELECT id::text AS id FROM parking_spots WHERE location_id=$1 AND code='P-115'`,
      [location.locationId],
    );
    const vehicleId = randomUUID();
    await fixture.query(
      `INSERT INTO vehicles
         (id,organization_id,plate_country,plate_number_raw,plate_number_normalized,updated_at)
       VALUES ($1,$2,'JO','FILTER-115','FILTER115',clock_timestamp())`,
      [vehicleId, admin.organizationId],
    );
    await fixture.query(
      `INSERT INTO valet_sessions
         (id,customer_access_token_hash,customer_access_expires_at,
          organization_id,location_id,vehicle_id,state,parking_zone_id,
          parking_spot_id,key_slot_id,checked_in_by_membership_id,updated_at)
       VALUES($1,$2,clock_timestamp()+interval '1 day',
              $3,$4,$5,'PARKED',$6,$7,$8,$9,clock_timestamp())`,
      [
        randomUUID(),
        randomUUID(),
        admin.organizationId,
        location.locationId,
        vehicleId,
        zoneId,
        spot.rows[0]!.id,
        key.rows[0]!.id,
        admin.membershipId,
      ],
    );

    const legacy = await fixture.managementGet(
      `${base}?limit=50`,
      auth.accessToken,
    );
    expect(legacy.status).toBe(200);
    expect(legacy.body?.counts).toEqual({
      keySlots: {
        configured: 125,
        active: 123,
        available: 122,
        inUse: 1,
        unknown: 2,
      },
      parkingSpots: {
        configured: 125,
        active: 123,
        available: 122,
        occupied: 1,
        unknown: 2,
      },
    });
    expect((legacy.body?.keySlots as { items: unknown[] }).items).toHaveLength(
      50,
    );
    expect(
      (legacy.body?.parkingSpots as { items: unknown[] }).items,
    ).toHaveLength(50);

    const first = await fixture.managementGet(
      `${base}?keyFilter=inactive&spotFilter=inactive&limit=1`,
      auth.accessToken,
    );
    expect(first.status).toBe(200);
    expect(first.body?.counts).toEqual(legacy.body?.counts);
    const keyPage1 = first.body?.keySlots as {
      items: { code: string; usage: string }[];
      nextCursor: string;
    };
    const spotPage1 = first.body?.parkingSpots as {
      items: { code: string; usage: string }[];
      nextCursor: string;
    };
    expect(keyPage1.items).toEqual([
      expect.objectContaining({ code: "K-112", usage: "UNKNOWN" }),
    ]);
    expect(spotPage1.items).toEqual([
      expect.objectContaining({ code: "P-112", usage: "UNKNOWN" }),
    ]);
    expect(keyPage1.nextCursor).toEqual(expect.any(String));
    expect(spotPage1.nextCursor).toEqual(expect.any(String));

    const second = await fixture.managementGet(
      `${base}?keyFilter=inactive&spotFilter=inactive&limit=1` +
        `&keyCursor=${encodeURIComponent(keyPage1.nextCursor)}` +
        `&spotCursor=${encodeURIComponent(spotPage1.nextCursor)}`,
      auth.accessToken,
    );
    expect(second.status).toBe(200);
    expect(
      second.body?.keySlots as {
        items: { code: string }[];
        nextCursor: string | null;
      },
    ).toEqual({
      items: [expect.objectContaining({ code: "K-119" })],
      nextCursor: null,
    });
    expect(
      second.body?.parkingSpots as {
        items: { code: string }[];
        nextCursor: string | null;
      },
    ).toEqual({
      items: [expect.objectContaining({ code: "P-119" })],
      nextCursor: null,
    });
    expect(second.body?.counts).toEqual(legacy.body?.counts);

    const busy = await fixture.managementGet(
      `${base}?keyFilter=busy&spotFilter=busy&limit=50`,
      auth.accessToken,
    );
    expect(busy.status).toBe(200);
    expect(
      (busy.body?.keySlots as { items: { code: string; usage: string }[] })
        .items,
    ).toEqual([expect.objectContaining({ code: "K-115", usage: "IN_USE" })]);
    expect(
      (busy.body?.parkingSpots as { items: { code: string; usage: string }[] })
        .items,
    ).toEqual([expect.objectContaining({ code: "P-115", usage: "OCCUPIED" })]);

    const available = await fixture.managementGet(
      `${base}?keyFilter=available&spotFilter=available&limit=100`,
      auth.accessToken,
    );
    expect(available.status).toBe(200);
    expect(
      (available.body?.keySlots as { items: { usage: string }[] }).items,
    ).toHaveLength(100);
    expect(
      (available.body?.keySlots as { items: { usage: string }[] }).items.every(
        (row) => row.usage === "AVAILABLE",
      ),
    ).toBe(true);
    expect(
      (available.body?.parkingSpots as { items: { usage: string }[] }).items,
    ).toHaveLength(100);
    expect(available.body?.counts).toEqual(legacy.body?.counts);

    await fixture.query(
      `UPDATE locations SET status='INACTIVE', accepting_intake=FALSE WHERE id=$1`,
      [location.locationId],
    );
    const closed = await fixture.managementGet(
      `${base}?keyFilter=available&spotFilter=available`,
      auth.accessToken,
    );
    expect(closed.status).toBe(200);
    expect(
      (closed.body?.counts as { keySlots: { available: number | null } })
        .keySlots.available,
    ).toBeNull();
    expect((closed.body?.keySlots as { items: unknown[] }).items).toEqual([]);
    expect((closed.body?.parkingSpots as { items: unknown[] }).items).toEqual(
      [],
    );
  });
});
