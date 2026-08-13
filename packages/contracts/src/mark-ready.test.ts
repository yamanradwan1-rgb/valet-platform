import { describe, expect, it } from "vitest";

import {
  markReadyRequestSchema,
  markReadyResponseSchema,
} from "./mark-ready.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("VAL-006E Mark Ready contracts", () => {
  it("accepts only a positive expected Session version", () => {
    expect(markReadyRequestSchema.parse({ expectedSessionVersion: 6 })).toEqual(
      {
        expectedSessionVersion: 6,
      },
    );
    for (const invalid of [
      {},
      { expectedSessionVersion: 0 },
      { expectedSessionVersion: -1 },
      { expectedSessionVersion: 1.5 },
      { expectedSessionVersion: 6, taskId: id },
    ]) {
      expect(markReadyRequestSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("requires the minimal READY and IN_PROGRESS response", () => {
    const response = {
      readyAt: "2026-08-13T12:00:00.000Z",
      sessionId: id,
      sessionVersion: 7,
      state: "READY",
      taskId: id,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    };
    expect(markReadyResponseSchema.parse(response)).toEqual(response);
    expect(
      markReadyResponseSchema.safeParse({ ...response, keySlotId: id }).success,
    ).toBe(false);
    expect(
      markReadyResponseSchema.safeParse({ ...response, state: "RETRIEVING" })
        .success,
    ).toBe(false);
    expect(
      markReadyResponseSchema.safeParse({
        ...response,
        taskStatus: "COMPLETED",
      }).success,
    ).toBe(false);
  });
});
