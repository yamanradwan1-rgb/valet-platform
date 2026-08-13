import { describe, expect, it } from "vitest";

import {
  startRetrievalRequestSchema,
  startRetrievalResponseSchema,
} from "./start-retrieval.js";

const id = "00000000-0000-4000-8000-000000000001";

describe("VAL-006D Start Retrieval contracts", () => {
  it("accepts exactly two positive integer versions", () => {
    const input = { expectedSessionVersion: 5, expectedTaskVersion: 3 };
    expect(startRetrievalRequestSchema.parse(input)).toEqual(input);
    for (const invalid of [
      { ...input, organizationId: id },
      { ...input, expectedSessionVersion: 0 },
      { ...input, expectedTaskVersion: 1.5 },
      { expectedSessionVersion: 5 },
    ]) {
      expect(startRetrievalRequestSchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });

  it("requires the minimal RETRIEVING and IN_PROGRESS response", () => {
    const response = {
      retrievalStartedAt: "2026-08-13T12:00:00.000Z",
      sessionId: id,
      sessionVersion: 6,
      state: "RETRIEVING",
      taskId: id,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    };
    expect(startRetrievalResponseSchema.parse(response)).toEqual(response);
    expect(
      startRetrievalResponseSchema.safeParse({
        ...response,
        keySlotId: id,
      }).success,
    ).toBe(false);
    expect(
      startRetrievalResponseSchema.safeParse({
        ...response,
        state: "REQUESTED",
      }).success,
    ).toBe(false);
  });
});
