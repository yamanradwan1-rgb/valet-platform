import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createConfirmParkedCommandExecutor } from "../src/modules/parking/confirm-parked-command";
import { createStartRetrievalCommandExecutor } from "../src/modules/retrieval/start-retrieval-command";
import {
  expectConfirmError,
} from "./confirm-parked-test-context";
import {
  expectStartRetrievalError,
  StartRetrievalTestContext,
} from "./start-retrieval-test-context";

const context = new StartRetrievalTestContext("v2-resource-identity");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function duplicateResourcesInOtherLocation(input: {
  readonly organizationId: string;
  readonly keySlotCode: string;
  readonly parkingSpotCode: string;
}) {
  const locationId = randomUUID();
  const keySlotId = randomUUID();
  const zoneId = randomUUID();
  const parkingSpotId = randomUUID();
  await context.adminPool.query(
    `INSERT INTO locations(
       id,organization_id,name,code,address_text,timezone,currency,status,
       accepting_intake,updated_at)
     VALUES($1,$2,'V2 other Location',$3,'Address','Asia/Amman','JOD',
            'ACTIVE',TRUE,clock_timestamp())`,
    [locationId, input.organizationId, `V2-${locationId}`],
  );
  await context.adminPool.query(
    `INSERT INTO key_slots(
       id,organization_id,location_id,code,status,updated_at)
     VALUES($1,$2,$3,$4,'ACTIVE',clock_timestamp())`,
    [keySlotId, input.organizationId, locationId, input.keySlotCode],
  );
  await context.adminPool.query(
    `INSERT INTO parking_zones(
       id,organization_id,location_id,code,label,status,updated_at)
     VALUES($1,$2,$3,$4,'V2 duplicate zone','ACTIVE',clock_timestamp())`,
    [zoneId, input.organizationId, locationId, `Z-${locationId}`],
  );
  await context.adminPool.query(
    `INSERT INTO parking_spots(
       id,organization_id,location_id,parking_zone_id,code,label,status,updated_at)
     VALUES($1,$2,$3,$4,$5,'V2 duplicate spot','ACTIVE',clock_timestamp())`,
    [parkingSpotId, input.organizationId, locationId, zoneId, input.parkingSpotCode],
  );
  return { keySlotId, locationId, parkingSpotId };
}

describe("DEC-096 V2 exact physical identity", () => {
  it("rejects same-code Key Slot or Parking Spot UUID from another Location", async () => {
    const fixture = await context.createConfirmParkedFixture();
    const other = await duplicateResourcesInOtherLocation(fixture);
    const execute = createConfirmParkedCommandExecutor(context.runtimePool);

    await expectConfirmError(
      execute({
        authenticatedUserId: fixture.userId,
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: fixture.keySlotCode,
        keySlotId: other.keySlotId,
        parkingSpotCode: fixture.parkingSpotCode,
        parkingSpotId: fixture.parkingSpotId,
        sessionId: fixture.sessionId,
      }),
      "KEY_CUSTODY_NOT_READY",
    );
    await expectConfirmError(
      execute({
        authenticatedUserId: fixture.userId,
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: fixture.keySlotCode,
        keySlotId: fixture.keySlotId,
        parkingSpotCode: fixture.parkingSpotCode,
        parkingSpotId: other.parkingSpotId,
        sessionId: fixture.sessionId,
      }),
      "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
    );

    const accepted = await execute({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: 3,
      expectedTaskVersion: 4,
      keySlotCode: fixture.keySlotCode,
      keySlotId: fixture.keySlotId,
      parkingSpotCode: fixture.parkingSpotCode,
      parkingSpotId: fixture.parkingSpotId,
      sessionId: fixture.sessionId,
    });
    expect(accepted).toMatchObject({
      parkingSpotId: fixture.parkingSpotId,
      state: "PARKED",
    });
  });

  it("rejects same-code Retrieval Key Slot UUID from another Location", async () => {
    const fixture = await context.createStartRetrievalFixture();
    const other = await duplicateResourcesInOtherLocation(fixture);
    const execute = createStartRetrievalCommandExecutor(context.runtimePool);

    await expectStartRetrievalError(
      execute({
        authenticatedUserId: fixture.userId,
        expectedSessionVersion: 5,
        expectedTaskVersion: 3,
        keySlotCode: fixture.keySlotCode,
        keySlotId: other.keySlotId,
        sessionId: fixture.sessionId,
      }),
      "KEY_CUSTODY_NOT_READY",
    );
    const accepted = await execute({
      authenticatedUserId: fixture.userId,
      expectedSessionVersion: 5,
      expectedTaskVersion: 3,
      keySlotCode: fixture.keySlotCode,
      keySlotId: fixture.keySlotId,
      sessionId: fixture.sessionId,
    });
    expect(accepted).toMatchObject({ state: "RETRIEVING" });
  });
});
