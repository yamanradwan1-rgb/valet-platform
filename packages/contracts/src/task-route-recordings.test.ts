import { describe, expect, it } from "vitest";
import {
  taskRouteRecordingsQuerySchema,
  taskRouteRecordingsResponseSchema,
} from "./task-route-recordings";

describe("Task route discovery transport", () => {
  it("bounds pages and rejects client authority claims", () => {
    expect(taskRouteRecordingsQuerySchema.parse({})).toEqual({ limit: 100 });
    for (const input of [
      { limit: 0 },
      { limit: 501 },
      { organizationId: "claimed" },
      { taskId: "claimed" },
      { role: "ORG_ADMIN" },
      { cursor: "x".repeat(513) },
    ]) {
      expect(taskRouteRecordingsQuerySchema.safeParse(input).success).toBe(
        false,
      );
    }
  });
  it("permits only ended recordings with truthful nullable provenance", () => {
    const value = {
      recordings: [
        {
          trackingSessionId: "11111111-1111-4111-8111-111111111111",
          startedAt: "2026-10-31T12:00:00Z",
          endedAt: "2026-10-31T12:01:00Z",
          assigneeMembershipId: null,
        },
      ],
      nextCursor: null,
    };
    expect(taskRouteRecordingsResponseSchema.parse(value)).toEqual(value);
    expect(
      taskRouteRecordingsResponseSchema.safeParse({
        ...value,
        recordings: [{ ...value.recordings[0], endedAt: null }],
      }).success,
    ).toBe(false);
    expect(
      taskRouteRecordingsResponseSchema.safeParse({ ...value, latitude: 31 })
        .success,
    ).toBe(false);
  });
});
