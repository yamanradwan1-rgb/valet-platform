import { describe, expect, it } from "vitest";

import {
  startParkingRequestSchema,
  startParkingResponseSchema,
} from "./start-parking.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("VAL-005F strict Start Parking contracts", () => {
  it("requires both positive integer versions and rejects authority fields", () => {
    expect(
      startParkingRequestSchema.parse({
        expectedSessionVersion: 2,
        expectedTaskVersion: 3,
      }),
    ).toEqual({ expectedSessionVersion: 2, expectedTaskVersion: 3 });
    for (const value of [
      { expectedTaskVersion: 3 },
      { expectedSessionVersion: 2 },
      { expectedSessionVersion: 0, expectedTaskVersion: 3 },
      {
        expectedSessionVersion: 2,
        expectedTaskVersion: 3,
        taskId: id,
      },
    ]) {
      expect(startParkingRequestSchema.safeParse(value).success).toBe(false);
    }
  });

  it("keeps the response exact and minimal", () => {
    const response = {
      parkingStartedAt: "2026-08-12T10:00:00.000Z",
      sessionId: id,
      sessionVersion: 3,
      state: "PARKING",
      taskId: id,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    };
    expect(startParkingResponseSchema.parse(response)).toEqual(response);
    expect(
      startParkingResponseSchema.safeParse({ ...response, keySlotId: id })
        .success,
    ).toBe(false);
  });
});
