import { describe, expect, it } from "vitest";

import {
  confirmParkedRequestSchema,
  confirmParkedResponseSchema,
} from "./confirm-parked.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("VAL-005G/DEC-065 strict Confirm Parked contracts", () => {
  it("requires both versions and trimmed exact Spot and Key Slot codes", () => {
    expect(
      confirmParkedRequestSchema.parse({
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: "  K-03  ",
        parkingSpotCode: "  A-042  ",
      }),
    ).toEqual({
      expectedSessionVersion: 3,
      expectedTaskVersion: 4,
      keySlotCode: "K-03",
      parkingSpotCode: "A-042",
    });
    for (const value of [
      {
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        parkingSpotCode: "A-042",
      },
      {
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: "K-03",
      },
      { expectedTaskVersion: 4, keySlotCode: "K-03", parkingSpotCode: "A-042" },
      { expectedSessionVersion: 3, keySlotCode: "K-03", parkingSpotCode: "A-042" },
      { keySlotCode: "K-03", parkingSpotCode: "A-042" },
      {
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: "",
        parkingSpotCode: "A-042",
      },
      {
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: "   ",
        parkingSpotCode: "A-042",
      },
      {
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: "K-03",
        parkingSpotCode: "A-042",
        parkingZoneId: id,
      },
    ])
      expect(confirmParkedRequestSchema.safeParse(value).success).toBe(false);

    expect(
      confirmParkedRequestSchema.parse({
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: "K-03",
        keySlotId: id,
        parkingSpotCode: "A-042",
        parkingSpotId: id,
      }),
    ).toEqual({
      expectedSessionVersion: 3,
      expectedTaskVersion: 4,
      keySlotCode: "K-03",
      keySlotId: id,
      parkingSpotCode: "A-042",
      parkingSpotId: id,
    });
    expect(
      confirmParkedRequestSchema.safeParse({
        expectedSessionVersion: 3,
        expectedTaskVersion: 4,
        keySlotCode: "K-03",
        parkingSpotId: id,
      }).success,
    ).toBe(false);
  });

  it("keeps the success response exact and minimal without slot detail", () => {
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
