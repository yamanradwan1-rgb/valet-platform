import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createConfirmParkedCommandExecutor } from "../src/modules/parking/confirm-parked-command";
import { createCancelBeforeParkingCommandExecutor } from "../src/modules/parking/cancel-before-parking-command";
import { createParkingSpotValidationQuery } from "../src/modules/parking/parking-spot-validation-query";
import { cancellationSqlBarrier } from "./cancel-check-in-race-barrier";
import { ConfirmParkedTestContext } from "./confirm-parked-test-context";
import {
  parkingPhysicalSnapshot,
  validationInput,
} from "./parking-spot-validation-test-support";

const context = new ConfirmParkedTestContext("264_races");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("#264 final truth after successful preflight", () => {
  it("L264-1: validates through a final Spot lock, reserves nothing, one binder wins", async () => {
    const first = await context.createConfirmParkedFixture();
    const second = await context.createCompetingFixture(first);
    const before = await parkingPhysicalSnapshot(context, second);
    const barrier = cancellationSqlBarrier(
      context.runtimePool,
      (sql) =>
        sql.includes("FROM parking_spots AS spot") &&
        sql.includes("FOR UPDATE"),
    );
    const winning = createConfirmParkedCommandExecutor(barrier.pool)({
      authenticatedUserId: first.userId,
      sessionId: first.sessionId,
      expectedSessionVersion: 3,
      expectedTaskVersion: 4,
      keySlotCode: first.keySlotCode,
      parkingSpotCode: first.parkingSpotCode,
    });
    try {
      await barrier.entered;
      // Reads through the held Spot lock; winner has not yet bound anything.
      expect(
        await createParkingSpotValidationQuery(context.runtimePool)(
          await validationInput(context, second),
        ),
      ).toMatchObject({ available: true });
      const losing = context.confirm(second);
      const outcomes = Promise.allSettled([winning, losing]);
      barrier.release();
      expect(await outcomes).toMatchObject([
        { status: "fulfilled" },
        {
          status: "rejected",
          reason: { code: "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE" },
        },
      ]);
      expect(await parkingPhysicalSnapshot(context, second)).toEqual(before);
      expect((await context.completionEffects(first)).events).toHaveLength(3);
      const occupancy = await context.adminPool.query(
        `SELECT id FROM valet_sessions WHERE parking_spot_id = $1`,
        [first.parkingSpotId],
      );
      expect(occupancy.rows).toHaveLength(1);
    } finally {
      barrier.release();
      await winning;
    }
  });

  it.each(["spot", "zone", "zone-change"])(
    "L264-2: final rejects changed %s and rolls back",
    async (change) => {
      const f = await context.createConfirmParkedFixture();
      expect(
        await createParkingSpotValidationQuery(context.runtimePool)(
          await validationInput(context, f),
        ),
      ).toMatchObject({ available: true });
      if (change === "spot")
        await context.adminPool.query(
          `UPDATE parking_spots SET status = 'INACTIVE' WHERE id = $1`,
          [f.parkingSpotId],
        );
      if (change === "zone")
        await context.adminPool.query(
          `UPDATE parking_zones SET status = 'INACTIVE' WHERE id = $1`,
          [f.parkingZoneId],
        );
      if (change === "zone-change") {
        const other = await context.addParkingResource(f);
        await context.adminPool.query(
          `UPDATE valet_sessions SET parking_zone_id = $1 WHERE id = $2`,
          [other.zone.id, f.sessionId],
        );
      }
      const before = await parkingPhysicalSnapshot(context, f);
      await expect(context.confirm(f)).rejects.toMatchObject({
        code: "PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE",
      });
      expect(await parkingPhysicalSnapshot(context, f)).toEqual(before);
    },
  );

  it("L264-5: ownership loss after preflight denies read and final mutation", async () => {
    const f = await context.createConfirmParkedFixture();
    const input = await validationInput(context, f);
    const validate = createParkingSpotValidationQuery(context.runtimePool);
    await validate(input);
    const other = await context.addMember(f);
    await context.adminPool.query(
      `UPDATE tasks SET current_assignee_membership_id = $1, version = version + 1 WHERE id = $2`,
      [other.membershipId, f.taskId],
    );
    const before = await parkingPhysicalSnapshot(context, f);
    await expect(validate(input)).rejects.toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
    });
    await expect(context.confirm(f)).rejects.toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
    });
    expect(await parkingPhysicalSnapshot(context, f)).toEqual(before);
  });

  it("L264-5: actual #261 terminal cancellation cannot validate", async () => {
    const f = await context.createStartParkingFixture({ assignKey: false });
    await context.adminPool.query(
      `UPDATE valet_sessions SET checking_in_completed_at = now() WHERE id = $1`,
      [f.sessionId],
    );
    const resource = await context.addParkingResource(f);
    const input = await validationInput(context, {
      ...f,
      parkingSpotCode: resource.spot.code,
      parkingSpotId: resource.spot.id,
      parkingZoneId: resource.zone.id,
    });
    await createCancelBeforeParkingCommandExecutor(context.runtimePool)({
      authenticatedUserId: f.userId,
      sessionId: f.sessionId,
      taskId: f.taskId,
      expectedShiftId: input.expectedShiftId,
      expectedSessionVersion: 1,
      expectedTaskVersion: 3,
    });
    await expect(
      createParkingSpotValidationQuery(context.runtimePool)({
        ...input,
        expectedSessionVersion: 2,
        expectedTaskVersion: 4,
      }),
    ).rejects.toMatchObject({ code: "TASK_INVALID_STATE" });
  });
});
