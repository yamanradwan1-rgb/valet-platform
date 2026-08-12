import { describe, expect, it } from "vitest";

import {
  confirmParkedRequestSchema,
  confirmParkedResponseSchema,
} from "./confirm-parked.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("VAL-005G strict Confirm Parked contracts", () => {
  it("requires both versions and a trimmed exact Spot code", () => {
    expect(
      confirmParkedRequestSchema.parse({
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        parkingSpotCode: "  A-042  ",
      }),
    ).toEqual({
      expectedSessionVersion: 3,
      expectedTaskVersion: 4,
      parkingSpotCode: "A-042",
    });
    for (const value of [
      { expectedTaskVersion: 4, parkingSpotCode: "A-042" },
      { expectedSessionVersion: 3, parkingSpotCode: "A-042" },
      { expectedSessionVersion: 3, expectedTaskVersion: 4 },
      {
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        parkingSpotCode: "A-042",
        parkingZoneId: id,
      },
    ])
      expect(confirmParkedRequestSchema.safeParse(value).success).toBe(false);
  });

  it("keeps the success response exact and minimal", () => {
    const value = {
      parkedAt: "2026-08-12T10:00:00.000Z",
      parkingSpotCode: "A-042",
      parkingSpotId: id,
      parkingZoneId: id,
      sessionId: id,
      sessionVersion: 4,
      state: "PARKED",
      taskId: id,
      taskStatus: "COMPLETED",
      taskVersion: 5,
    };
    expect(confirmParkedResponseSchema.parse(value)).toEqual(value);
    expect(
      confirmParkedResponseSchema.safeParse({ ...value, keySlotCode: "K1" })
        .success,
    ).toBe(false);
  });
});
