import { describe, expect, it } from "vitest";
import {
  cancelBeforeParkingRequestSchema,
  parkingCancellationStatusQuerySchema,
  parkingCancellationStatusResponseSchema,
} from "./cancel-before-parking.js";

const id = "00000000-0000-4000-8000-000000000001";
describe("pre-custody cancellation transport", () => {
  const request = {
    taskId: id,
    expectedShiftId: id,
    expectedSessionVersion: 2,
    expectedTaskVersion: 3,
  };
  it("requires exact IDs/positive numeric versions and rejects client authority", () => {
    expect(cancelBeforeParkingRequestSchema.parse(request)).toEqual(request);
    for (const replacement of [
      { taskId: "bad" },
      { expectedShiftId: "bad" },
      { expectedSessionVersion: 0 },
      { expectedTaskVersion: 1.5 },
      { expectedSessionVersion: "2" },
      { organizationId: id },
      { state: "CANCELLED" },
      { actor: id },
    ])
      expect(
        cancelBeforeParkingRequestSchema.safeParse({
          ...request,
          ...replacement,
        }).success,
      ).toBe(false);
    expect(
      parkingCancellationStatusQuerySchema.safeParse({
        taskId: id,
        expectedShiftId: id,
      }).success,
    ).toBe(true);
    expect(
      parkingCancellationStatusQuerySchema.safeParse({
        taskId: [id],
        expectedShiftId: id,
      }).success,
    ).toBe(false);
  });
  it("cannot infer terminal success from a missing task or expose scope/PII", () => {
    const safe = {
      outcome: "NOT_CANCELLED",
      sessionId: id,
      taskId: id,
      sessionVersion: 2,
      taskVersion: 3,
      classification: "PRE_CUSTODY",
    };
    expect(
      parkingCancellationStatusResponseSchema.safeParse(safe).success,
    ).toBe(true);
    expect(
      parkingCancellationStatusResponseSchema.safeParse({
        outcome: "CANCELLED",
        taskId: id,
      }).success,
    ).toBe(false);
    expect(
      parkingCancellationStatusResponseSchema.safeParse({
        ...safe,
        plate: "PII",
      }).success,
    ).toBe(false);
  });
});
