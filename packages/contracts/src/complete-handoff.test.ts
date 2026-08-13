import { describe, expect, it } from "vitest";

import {
  completeHandoffRequestSchema,
  completeHandoffResponseSchema,
} from "./complete-handoff";

describe("complete handoff contracts", () => {
  it("accepts only the expected session version request", () => {
    expect(
      completeHandoffRequestSchema.parse({ expectedSessionVersion: 9 }),
    ).toEqual({ expectedSessionVersion: 9 });
    expect(
      completeHandoffRequestSchema.safeParse({
        expectedSessionVersion: 9,
        taskId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
    expect(completeHandoffRequestSchema.safeParse({}).success).toBe(false);
  });

  it("accepts only the terminal operational projection", () => {
    const response = {
      retrievalRequestStatus: "COMPLETED",
      sessionId: crypto.randomUUID(),
      sessionVersion: 10,
      state: "COMPLETED",
      taskId: crypto.randomUUID(),
      taskStatus: "COMPLETED",
      taskVersion: 6,
    };
    expect(completeHandoffResponseSchema.parse(response)).toEqual(response);
    expect(
      completeHandoffResponseSchema.safeParse({
        ...response,
        verificationId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});
