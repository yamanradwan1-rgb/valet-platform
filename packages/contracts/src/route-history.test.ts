import { describe, expect, it } from "vitest";

import {
  routeHistoryQuerySchema,
  routeHistoryResponseSchema,
} from "./route-history.js";

describe("route history contracts", () => {
  it("defaults and bounds the strict query", () => {
    expect(routeHistoryQuerySchema.parse({})).toEqual({ limit: 100 });
    expect(routeHistoryQuerySchema.parse({ limit: "500" }).limit).toBe(500);
    expect(routeHistoryQuerySchema.safeParse({ limit: "501" }).success).toBe(false);
    expect(routeHistoryQuerySchema.safeParse({ taskId: "hidden" }).success).toBe(false);
  });

  it("exposes only exact route coordinates and capture time", () => {
    const sample = {
      capturedAt: "2026-08-15T10:00:00.000Z",
      latitude: 31.9539,
      longitude: 35.9106,
    };
    expect(
      routeHistoryResponseSchema.parse({ nextCursor: null, samples: [sample] }),
    ).toEqual({ nextCursor: null, samples: [sample] });
    expect(
      routeHistoryResponseSchema.safeParse({
        nextCursor: null,
        samples: [{ ...sample, id: crypto.randomUUID() }],
      }).success,
    ).toBe(false);
  });
});
