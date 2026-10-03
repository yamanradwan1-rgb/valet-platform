import { describe, expect, it } from "vitest";
import {
  parkingSpotValidationQuerySchema,
  parkingSpotValidationResponseSchema,
} from "./parking-spot-validation";

const id = "11111111-1111-4111-8111-111111111111";
const query = {
  taskId: id,
  expectedShiftId: id,
  expectedSessionVersion: "3",
  expectedTaskVersion: "4",
  parkingSpotCode: " 14 ",
};

describe("Parking Spot validation contract", () => {
  it("parses explicit positive query integers and trims only code edges", () => {
    expect(parkingSpotValidationQuerySchema.parse(query)).toEqual({
      ...query,
      expectedSessionVersion: 3,
      expectedTaskVersion: 4,
      parkingSpotCode: "14",
    });
    expect(
      parkingSpotValidationQuerySchema.parse({
        ...query,
        parkingSpotCode: " a-١.4 ",
        parkingSpotId: id,
      }).parkingSpotCode,
    ).toBe("a-١.4");
  });

  it.each([
    { organizationId: id },
    { locationId: id },
    { role: "VALET_EMPLOYEE" },
    { taskId: "bad" },
    { expectedShiftId: "bad" },
    { parkingSpotId: "bad" },
    { expectedSessionVersion: "0" },
    { expectedTaskVersion: "-1" },
    { expectedTaskVersion: "1.5" },
    { expectedTaskVersion: "1e2" },
    { expectedTaskVersion: " 2 " },
    { expectedTaskVersion: true },
    { expectedTaskVersion: ["2"] },
    { parkingSpotCode: " " },
  ])("rejects invalid or client authority query %j", (change) => {
    expect(
      parkingSpotValidationQuerySchema.safeParse({ ...query, ...change })
        .success,
    ).toBe(false);
  });

  it("requires a strict affirmative scoped response", () => {
    const response = {
      sessionId: id,
      taskId: id,
      sessionVersion: 3,
      taskVersion: 4,
      parkingSpotId: id,
      parkingZoneId: id,
      parkingSpotCode: "14",
      available: true,
    };
    expect(parkingSpotValidationResponseSchema.parse(response)).toEqual(
      response,
    );
    for (const change of [
      { available: false },
      { reserved: true },
      { parkingSpotId: "bad" },
      { taskVersion: 0 },
    ]) {
      expect(
        parkingSpotValidationResponseSchema.safeParse({
          ...response,
          ...change,
        }).success,
      ).toBe(false);
    }
  });
});
