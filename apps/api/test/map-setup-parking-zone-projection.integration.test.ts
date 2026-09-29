import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  MapSetupTestContext,
  validArea,
} from "./map-setup-test-context";

const context = new MapSetupTestContext("map-zone-projection");
const mapBase = (locationId: string) =>
  `/v1/staff/locations/${locationId}/map`;

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function insertZone(input: {
  code: string;
  locationId: string;
  organizationId: string;
  status?: "ACTIVE" | "INACTIVE";
}) {
  const parkingZoneId = randomUUID();
  await context.database.adminPool.query(
    `INSERT INTO parking_zones
       (id, organization_id, location_id, code, label, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, transaction_timestamp())`,
    [
      parkingZoneId,
      input.organizationId,
      input.locationId,
      input.code,
      `Label ${input.code}`,
      input.status ?? "ACTIVE",
    ],
  );
  return parkingZoneId;
}

describe("Issue #231 Map Setup ParkingZone projection", () => {
  it("lists bounded ACTIVE choices for exact LM scope without Dashboard entitlement", async () => {
    const actor = await context.actor();
    const subscription = await context.database.adminPool.query<{
      dashboard_access_enabled: boolean;
    }>(
      `SELECT dashboard_access_enabled
       FROM organization_subscriptions WHERE organization_id = $1`,
      [actor.fixture.organizationId],
    );
    expect(subscription.rows[0]?.dashboard_access_enabled).toBe(false);
    const zoneA = await insertZone({
      code: "ZONE-A",
      locationId: actor.fixture.locationId,
      organizationId: actor.fixture.organizationId,
    });
    await insertZone({
      code: "ZONE-B",
      locationId: actor.fixture.locationId,
      organizationId: actor.fixture.organizationId,
    });
    await insertZone({
      code: "ZONE-INACTIVE",
      locationId: actor.fixture.locationId,
      organizationId: actor.fixture.organizationId,
      status: "INACTIVE",
    });

    const first = await context.request(
      "GET",
      `${mapBase(actor.fixture.locationId)}/parking-zones?limit=1`,
      { token: actor.token },
    );
    expect(first.status).toBe(200);
    expect(first.body.items).toEqual([
      {
        code: "ZONE-A",
        label: "Label ZONE-A",
        parkingZoneId: zoneA,
        status: "ACTIVE",
      },
    ]);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(first.body)).not.toMatch(
      /occupancy|capacity|available|assignment/i,
    );

    const second = await context.request(
      "GET",
      `${mapBase(actor.fixture.locationId)}/parking-zones?limit=1&cursor=${encodeURIComponent(String(first.body.nextCursor))}`,
      { token: actor.token },
    );
    expect(second.status).toBe(200);
    expect(second.body.items).toEqual([
      expect.objectContaining({ code: "ZONE-B", status: "ACTIVE" }),
    ]);
  });

  it("binds cursor and authorization to the exact active granted Location", async () => {
    const actor = await context.actor();
    await insertZone({
      code: "ZONE-A",
      locationId: actor.fixture.locationId,
      organizationId: actor.fixture.organizationId,
    });
    await insertZone({
      code: "ZONE-B",
      locationId: actor.fixture.locationId,
      organizationId: actor.fixture.organizationId,
    });
    const first = await context.request(
      "GET",
      `${mapBase(actor.fixture.locationId)}/parking-zones?limit=1`,
      { token: actor.token },
    );
    const otherGranted = await context.database.addLocation(actor.fixture);
    const wrongCursor = await context.request(
      "GET",
      `${mapBase(otherGranted)}/parking-zones?limit=1&cursor=${encodeURIComponent(String(first.body.nextCursor))}`,
      { token: actor.token },
    );
    expect(wrongCursor.status).toBe(400);

    const ungrantedId = randomUUID();
    await context.database.adminPool.query(
      `INSERT INTO locations
         (id, organization_id, name, code, address_text, timezone, currency,
          status, accepting_intake, updated_at)
       VALUES ($1, $2, 'Ungranted', $3, 'Address', 'Asia/Amman', 'JOD',
               'ACTIVE', TRUE, transaction_timestamp())`,
      [ungrantedId, actor.fixture.organizationId, randomUUID()],
    );
    const ungranted = await context.request(
      "GET",
      `${mapBase(ungrantedId)}/parking-zones`,
      { token: actor.token },
    );
    expect(ungranted.status).toBe(404);

    const foreign = await context.actor();
    const foreignRead = await context.request(
      "GET",
      `${mapBase(foreign.fixture.locationId)}/parking-zones`,
      { token: actor.token },
    );
    expect(foreignRead.status).toBe(404);

    const inactive = await context.actor({ locationStatus: "INACTIVE" });
    const inactiveRead = await context.request(
      "GET",
      `${mapBase(inactive.fixture.locationId)}/parking-zones`,
      { token: inactive.token },
    );
    expect(inactiveRead.status).toBe(404);
  });

  it.each(["ORG_ADMIN", "VALET_SUPERVISOR", "VALET_EMPLOYEE"] as const)(
    "does not widen Map Setup selector authority to %s",
    async (role) => {
      const actor = await context.actor({ role });
      const response = await context.request(
        "GET",
        `${mapBase(actor.fixture.locationId)}/parking-zones`,
        { token: actor.token },
      );
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    },
  );

  it("explains an existing INACTIVE linked Zone while excluding it from choices", async () => {
    const actor = await context.actor();
    const parkingZoneId = await insertZone({
      code: "ZONE-OLD",
      locationId: actor.fixture.locationId,
      organizationId: actor.fixture.organizationId,
    });
    const created = await context.request(
      "POST",
      `${mapBase(actor.fixture.locationId)}/areas`,
      {
        body: { ...validArea, parkingZoneId },
        token: actor.token,
      },
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      parkingZone: {
        code: "ZONE-OLD",
        label: "Label ZONE-OLD",
        parkingZoneId,
        status: "ACTIVE",
      },
      parkingZoneId,
    });

    await context.database.adminPool.query(
      `UPDATE parking_zones SET status = 'INACTIVE' WHERE id = $1`,
      [parkingZoneId],
    );
    const listedAreas = await context.request(
      "GET",
      `${mapBase(actor.fixture.locationId)}/areas`,
      { token: actor.token },
    );
    expect(listedAreas.body.areas).toEqual([
      expect.objectContaining({
        parkingZone: {
          code: "ZONE-OLD",
          label: "Label ZONE-OLD",
          parkingZoneId,
          status: "INACTIVE",
        },
        parkingZoneId,
      }),
    ]);
    const choices = await context.request(
      "GET",
      `${mapBase(actor.fixture.locationId)}/parking-zones?limit=100`,
      { token: actor.token },
    );
    expect(choices.body.items).toEqual([]);
  });
});
