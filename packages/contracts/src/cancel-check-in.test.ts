import { describe, expect, it } from "vitest";
import {
  cancelCheckInRequestSchema,
  cancelCheckInResponseSchema,
  cancelCheckInStatusResponseSchema,
} from "./cancel-check-in.js";
import { guestSafeSessionResponseSchema } from "./check-in.js";
import { staffVehicleDirectoryRowStateSchema } from "./staff-vehicle-directory.js";

const id = "4ad56b40-3bdf-4586-9a42-084fe65e72f5";
describe("Incomplete Check-In cancellation contracts", () => {
  it("accepts only exact expected lifecycle version and Shift", () => {
    expect(
      cancelCheckInRequestSchema.parse({
        expectedVersion: 1,
        expectedShiftId: id,
      }),
    ).toEqual({ expectedVersion: 1, expectedShiftId: id });
    for (const expectedVersion of [0, -1, 1.5, "1", undefined]) {
      expect(
        cancelCheckInRequestSchema.safeParse({
          expectedVersion,
          expectedShiftId: id,
        }).success,
      ).toBe(false);
    }
    for (const extra of [
      "actorId",
      "state",
      "reason",
      "organizationId",
      "timestamp",
    ]) {
      expect(
        cancelCheckInRequestSchema.safeParse({
          expectedVersion: 1,
          expectedShiftId: id,
          [extra]: id,
        }).success,
      ).toBe(false);
    }
    expect(
      cancelCheckInRequestSchema.safeParse({
        expectedVersion: 1,
        expectedShiftId: "bad",
      }).success,
    ).toBe(false);
  });
  it("keeps terminal responses minimal and status canonical", () => {
    const value = {
      sessionId: id,
      locationId: id,
      state: "CANCELLED",
      version: 2,
    };
    expect(cancelCheckInResponseSchema.parse(value)).toEqual(value);
    expect(
      cancelCheckInStatusResponseSchema.parse({
        ...value,
        state: "CHECKING_IN",
      }).state,
    ).toBe("CHECKING_IN");
    expect(
      cancelCheckInResponseSchema.safeParse({ ...value, token: "secret" })
        .success,
    ).toBe(false);
    expect(
      cancelCheckInResponseSchema.safeParse({ ...value, state: "COMPLETED" })
        .success,
    ).toBe(false);
  });
  it("does not widen Guest or active directory contracts", () => {
    expect(
      staffVehicleDirectoryRowStateSchema.safeParse("CANCELLED").success,
    ).toBe(false);
    expect(
      staffVehicleDirectoryRowStateSchema.safeParse("COMPLETED").success,
    ).toBe(false);
    const guest = {
      readyAt: null,
      state: "CANCELLED",
      valetSessionId: id,
      vehicle: { color: null, make: null, model: null },
    };
    expect(guestSafeSessionResponseSchema.safeParse(guest).success).toBe(false);
    expect(
      guestSafeSessionResponseSchema.safeParse({ ...guest, state: "COMPLETED" })
        .success,
    ).toBe(true);
  });
});
