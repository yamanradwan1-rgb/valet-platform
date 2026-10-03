import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createParkingSpotValidationQuery } from "../src/modules/parking/parking-spot-validation-query";
import {
  ConfirmParkedTestContext,
  type ConfirmParkedFixture,
} from "./confirm-parked-test-context";

const context = new ConfirmParkedTestContext("264_read");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function input(f: ConfirmParkedFixture) {
  const shift = await context.adminPool.query<{ id: string }>(
    `SELECT id::text FROM shifts WHERE membership_id = $1 AND status = 'ACTIVE'`,
    [f.membershipId],
  );
  return {
    authenticatedUserId: f.userId,
    sessionId: f.sessionId,
    taskId: f.taskId,
    expectedShiftId: shift.rows[0]!.id,
    expectedSessionVersion: 3,
    expectedTaskVersion: 4,
    parkingSpotCode: f.parkingSpotCode,
  };
}

describe("#264 scoped Parking Spot read", () => {
  it("returns exact manual/V2 identity and changes no rows or history", async () => {
    const f = await context.createConfirmParkedFixture();
    await context.adminPool.query(
      `UPDATE parking_spots SET code = '14' WHERE id = $1`,
      [f.parkingSpotId],
    );
    const request = { ...(await input(f)), parkingSpotCode: " 14 " };
    const tables = [
      "valet_sessions",
      "tasks",
      "parking_spots",
      "parking_zones",
      "key_slots",
      "task_tracking_sessions",
      "audit_events",
      "dispatch_events",
      "key_custody_events",
    ];
    const snapshot = async () => {
      const rows = [];
      for (const table of tables) {
        rows.push(
          (
            await context.adminPool.query(
              `SELECT * FROM ${table} WHERE organization_id = $1 ORDER BY id`,
              [f.organizationId],
            )
          ).rows,
        );
      }
      return rows;
    };
    const before = await snapshot();
    const validate = createParkingSpotValidationQuery(context.runtimePool);
    const response = {
      available: true,
      sessionId: f.sessionId,
      taskId: f.taskId,
      sessionVersion: 3,
      taskVersion: 4,
      parkingSpotId: f.parkingSpotId,
      parkingSpotCode: "14",
      parkingZoneId: f.parkingZoneId,
    };
    expect(await validate(request)).toEqual(response);
    expect(
      await validate({ ...request, parkingSpotId: f.parkingSpotId }),
    ).toEqual(response);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    "spot",
    "zone",
    "null-zone",
    "bound-zone",
    "occupied",
    "id",
    "unknown",
    "foreign",
    "location",
  ])("conceals %s resource failure", async (scenario) => {
    const f = await context.createConfirmParkedFixture();
    let request = await input(f);
    if (scenario === "spot")
      await context.adminPool.query(
        `UPDATE parking_spots SET status = 'INACTIVE' WHERE id = $1`,
        [f.parkingSpotId],
      );
    if (scenario === "zone")
      await context.adminPool.query(
        `UPDATE parking_zones SET status = 'INACTIVE' WHERE id = $1`,
        [f.parkingZoneId],
      );
    if (scenario === "null-zone")
      await context.adminPool.query(
        `UPDATE parking_spots SET parking_zone_id = NULL WHERE id = $1`,
        [f.parkingSpotId],
      );
    if (scenario === "bound-zone") {
      const other = await context.addParkingResource(f);
      await context.adminPool.query(
        `UPDATE valet_sessions SET parking_zone_id = $1 WHERE id = $2`,
        [other.zone.id, f.sessionId],
      );
    }
    if (scenario === "occupied")
      await context.confirm(await context.createCompetingFixture(f));
    if (scenario === "id")
      request = { ...request, parkingSpotId: randomUUID() } as typeof request;
    if (scenario === "unknown") request.parkingSpotCode = randomUUID();
    if (scenario === "foreign")
      request.parkingSpotCode = (
        await context.createConfirmParkedFixture()
      ).parkingSpotCode;
    if (scenario === "location") {
      const other = await context.addLocation(f);
      const resource = await context.addParkingResource({
        ...f,
        locationId: other,
      });
      request.parkingSpotCode = resource.spot.code;
    }
    await expect(
      createParkingSpotValidationQuery(context.runtimePool)(request),
    ).rejects.toMatchObject({ code: "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE" });
  });
});
