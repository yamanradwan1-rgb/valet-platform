import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStaffValetSessionHarness } from "./staff-valet-session-harness";
import { cancellationSqlBarrier } from "./cancel-check-in-race-barrier";
import { createCancelCheckInCommandExecutor } from "../src/modules/valet-sessions/cancel-check-in-command";
import {
  createCompleteCheckInConditionCommandExecutor,
  createRegisterCheckInConditionPhotoCommandExecutor,
} from "../src/modules/valet-sessions/check-in-condition-command";
import { createVehicleDetailsCommandExecutor } from "../src/modules/vehicles/vehicle-details-command";

describe("Cancel against condition completion, photo and Vehicle detail writes", () => {
  const harness = createStaffValetSessionHarness();
  beforeAll(() => harness.start(), 120_000);
  afterAll(() => harness.close(), 60_000);
  it.each(["CONDITION", "PHOTO", "DETAILS"] as const)(
    "serializes %s in both commit orders",
    async (kind) => {
      for (const cancelFirst of [false, true]) {
        const { fixture } = await harness.fixtureWithToken();
        const { sessionId, vehicleId } = await harness.createSession(fixture);
        const shift = await harness.context.adminPool.query(
          "SELECT id FROM shifts WHERE membership_id=$1",
          [fixture.membershipId],
        );
        const vehicle = await harness.context.adminPool.query(
          "SELECT updated_at FROM vehicles WHERE id=$1",
          [vehicleId],
        );
        const input = {
          authenticatedUserId: fixture.userId,
          sessionId,
          expectedVersion: 1,
          expectedShiftId: shift.rows[0].id as string,
        };
        const staff = {
          authenticatedUserId: fixture.userId,
          valetSessionId: sessionId,
        };
        const child = (pool: typeof harness.context.runtimePool) =>
          kind === "CONDITION"
            ? createCompleteCheckInConditionCommandExecutor(pool)(staff)
            : kind === "PHOTO"
              ? createRegisterCheckInConditionPhotoCommandExecutor(pool)({
                  ...staff,
                  contentType: "image/jpeg",
                  storageObjectKey: `private/${sessionId}/condition.jpg`,
                })
              : createVehicleDetailsCommandExecutor(pool)({
                  ...staff,
                  expectedVehicleUpdatedAt: vehicle.rows[0].updated_at as Date,
                  make: "Retained make",
                  model: null,
                  color: null,
                });
        const barrier = cancellationSqlBarrier(
          harness.context.runtimePool,
          (sql) =>
            cancelFirst
              ? sql.includes("UPDATE valet_sessions SET state = 'CANCELLED'")
              : kind === "CONDITION"
                ? sql.includes("SET check_in_condition_completed_at")
                : kind === "PHOTO"
                  ? sql.includes("INSERT INTO vehicle_photos")
                  : sql.includes("UPDATE vehicles"),
        );
        const first = cancelFirst
          ? createCancelCheckInCommandExecutor(barrier.pool)(input)
          : child(barrier.pool);
        await barrier.entered;
        const second = (
          cancelFirst
            ? child(harness.context.runtimePool)
            : createCancelCheckInCommandExecutor(harness.context.runtimePool)(
                input,
              )
        ).then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        try {
          await barrier.proveBlocked(harness.context.adminPool);
        } finally {
          barrier.release();
        }
        await first;
        if (cancelFirst)
          expect(await second).toHaveProperty(
            "error.code",
            kind === "DETAILS"
              ? "VEHICLE_DETAILS_SESSION_NOT_MUTABLE"
              : "INVALID_STATE_TRANSITION",
          );
        else {
          expect(await second).toHaveProperty("value.state", "CANCELLED");
          const facts = await harness.context.adminPool.query(
            `SELECT s.version, s.check_in_condition_completed_at,
          (SELECT count(*)::int FROM vehicle_photos WHERE valet_session_id=s.id) AS photos,
          (SELECT make FROM vehicles WHERE id=s.vehicle_id) AS make FROM valet_sessions s WHERE id=$1`,
            [sessionId],
          );
          expect(facts.rows[0].version).toBe(2);
          if (kind === "CONDITION")
            expect(
              facts.rows[0].check_in_condition_completed_at,
            ).toBeInstanceOf(Date);
          if (kind === "PHOTO") expect(facts.rows[0].photos).toBe(1);
          if (kind === "DETAILS")
            expect(facts.rows[0].make).toBe("Retained make");
          if (kind !== "DETAILS")
            await expect(
              child(harness.context.runtimePool),
            ).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
        }
      }
    },
  );
});
