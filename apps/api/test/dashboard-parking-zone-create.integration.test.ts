import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  ParkingZoneCreateTestFixture,
  zonePath,
} from "./parking-zone-create-test-fixture";

const fixture = new ParkingZoneCreateTestFixture();
beforeAll(() => fixture.start(), 120_000);
afterEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("Issue #236 authoritative zone create", () => {
  it("persists exact scoped ACTIVE zone, replays normalized payload and appends one safe audit", async () => {
    const actor = await fixture.actor();
    const body = {
      operationId: randomUUID(),
      code: " Z:a-١ ",
      label: " منطقة أمامية ",
    };
    const first = await fixture.createZone(actor, body);
    expect(first.status).toBe(201);
    expect(first.headers.get("cache-control")).toContain("no-store");
    expect(first.body).toEqual({
      parkingZoneId: expect.any(String),
      code: "Z:a-١",
      label: "منطقة أمامية",
      status: "ACTIVE",
    });
    const replay = await fixture.createZone(actor, {
      ...body,
      code: "Z:a-١",
      label: "منطقة أمامية",
    });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    const rows = await fixture.query<Record<string, unknown>>(
      `SELECT zone.organization_id,zone.location_id,zone.status,audit.entity_type,
        audit.valet_session_id,audit.actor_membership_id,audit.metadata_json
       FROM parking_zones zone JOIN audit_events audit ON audit.entity_id=zone.id
       WHERE zone.id=$1 AND audit.event_type='PARKING_ZONE_CREATED'`,
      [first.body?.parkingZoneId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      organization_id: actor.organizationId,
      location_id: actor.locationId,
      status: "ACTIVE",
      entity_type: "ParkingZone",
      valet_session_id: null,
      actor_membership_id: actor.membershipId,
    });
    expect(rows.rows[0]?.metadata_json).toEqual({
      requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      resourceCode: "Z:a-١",
      resourceType: "PARKING_ZONE",
      status: "ACTIVE",
    });
    const list = await fixture.managementGet(
      zonePath(actor.locationId),
      actor.accessToken,
    );
    expect(list.body?.items).toEqual([first.body]);
    const spot = await fixture.managementPost(
      zonePath(actor.locationId).replace("parking-zones", "parking-spots"),
      actor.accessToken,
      {
        operationId: randomUUID(),
        code: "P-01",
        label: "Front",
        parkingZoneId: first.body?.parkingZoneId,
      },
    );
    expect(spot.status).toBe(201);
    expect(spot.body?.parkingZone).toEqual(first.body);
  });

  it("rejects duplicate/inactive codes, permits exact code in another Location and preserves case", async () => {
    const actor = await fixture.actor();
    const created = await fixture.createZone(actor);
    const duplicate = await fixture.createZone(actor);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body?.code).toBe("RESOURCE_CODE_CONFLICT");
    await fixture.query(
      "UPDATE parking_zones SET status='INACTIVE' WHERE id=$1",
      [created.body?.parkingZoneId],
    );
    expect((await fixture.createZone(actor)).body?.code).toBe(
      "RESOURCE_CODE_CONFLICT",
    );
    const other = await fixture.addLocation(actor.organizationId);
    expect(
      (await fixture.createZone({ ...actor, locationId: other.locationId }))
        .status,
    ).toBe(201);
    expect(
      (
        await fixture.createZone(actor, {
          operationId: randomUUID(),
          code: "za",
          label: "Case",
        })
      ).status,
    ).toBe(201);
  });

  it("conflicts on changes to code, label, Location and resource kind for an existing operation", async () => {
    const actor = await fixture.actor();
    const body = { operationId: randomUUID(), code: "ZA", label: "Zone A" };
    expect((await fixture.createZone(actor, body)).status).toBe(201);
    const other = await fixture.addLocation(actor.organizationId);
    for (const [target, request] of [
      [actor, { ...body, code: "ZB" }],
      [actor, { ...body, label: "Other" }],
      [{ ...actor, locationId: other.locationId }, body],
    ] as const) {
      const conflict = await fixture.createZone(target, request);
      expect(conflict.status).toBe(409);
      expect(conflict.body?.code).toBe("IDEMPOTENCY_CONFLICT");
    }
    const key = await fixture.managementPost(
      zonePath(actor.locationId).replace("parking-zones", "key-slots"),
      actor.accessToken,
      { operationId: body.operationId, code: "K1" },
    );
    expect(key.body?.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("serializes concurrent identical requests and competing operation IDs", async () => {
    const actor = await fixture.actor("LOCATION_MANAGER");
    const body = { operationId: randomUUID(), code: "SAME", label: "Same" };
    const identical = await Promise.all([
      fixture.createZone(actor, body),
      fixture.createZone(actor, body),
    ]);
    expect(identical.map((result) => result.status)).toEqual([201, 201]);
    expect(identical[0]?.body).toEqual(identical[1]?.body);
    const competing = await Promise.all([
      fixture.createZone(actor, {
        ...body,
        operationId: randomUUID(),
        code: "RACE",
      }),
      fixture.createZone(actor, {
        ...body,
        operationId: randomUUID(),
        code: "RACE",
      }),
    ]);
    expect(competing.map((result) => result.status).sort()).toEqual([201, 409]);
    const count = await fixture.query<{ count: string }>(
      "SELECT count(*)::text FROM audit_events WHERE location_id=$1 AND event_type='PARKING_ZONE_CREATED'",
      [actor.locationId],
    );
    expect(count.rows[0]?.count).toBe("2");
  });

  it("rolls creation back when audit insertion fails", async () => {
    const actor = await fixture.actor();
    await fixture.query(`CREATE FUNCTION test_zone_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='PARKING_ZONE_CREATED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_zone_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_zone_audit_failure()`);
    try {
      expect((await fixture.createZone(actor)).status).toBe(500);
      const count = await fixture.query<{ count: string }>(
        "SELECT count(*)::text FROM parking_zones WHERE location_id=$1",
        [actor.locationId],
      );
      expect(count.rows[0]?.count).toBe("0");
    } finally {
      await fixture.query(
        "DROP TRIGGER test_zone_audit_failure ON audit_events; DROP FUNCTION test_zone_audit_failure()",
      );
    }
  });

  it("keeps transport strict and does not classify unrelated unique violations as code conflicts", async () => {
    const actor = await fixture.actor();
    expect(
      (
        await fixture.createZone(actor, {
          operationId: randomUUID(),
          code: "ZA",
          label: "A",
          organizationId: actor.organizationId,
        })
      ).status,
    ).toBe(400);
    await fixture.query(
      "CREATE UNIQUE INDEX test_zone_label_unique ON parking_zones(location_id,label) WHERE code LIKE 'OTHER-UNIQUE-%'",
    );
    try {
      expect(
        (
          await fixture.createZone(actor, {
            operationId: randomUUID(),
            code: "OTHER-UNIQUE-ONE",
            label: "Zone A",
          })
        ).status,
      ).toBe(201);
      const failure = await fixture.createZone(actor, {
        operationId: randomUUID(),
        code: "OTHER-UNIQUE-TWO",
        label: "Zone A",
      });
      expect(failure.status).toBe(500);
      expect(failure.body?.code).not.toBe("RESOURCE_CODE_CONFLICT");
    } finally {
      await fixture.query("DROP INDEX test_zone_label_unique");
    }
  });
});
