import { describe, expect, it } from "vitest";

import {
  liveOperationsMapQuerySchema,
  liveOperationsMapResponseSchema,
} from "./live-operations-map.js";

describe("live operations map contracts", () => {
  it("defaults and bounds the strict query", () => {
    expect(liveOperationsMapQuerySchema.parse({})).toEqual({ limit: 100 });
    expect(liveOperationsMapQuerySchema.parse({ limit: "500" }).limit).toBe(
      500,
    );
    expect(liveOperationsMapQuerySchema.safeParse({ limit: 0 }).success).toBe(
      false,
    );
    expect(liveOperationsMapQuerySchema.safeParse({ limit: 501 }).success).toBe(
      false,
    );
    expect(
      liveOperationsMapQuerySchema.safeParse({ taskId: crypto.randomUUID() })
        .success,
    ).toBe(false);
  });

  it("accepts only the narrow public projection", () => {
    const id = crypto.randomUUID();
    const response = {
      items: [
        {
          assigneeMembershipId: id,
          position: null,
          sessionState: "PARKING",
          taskId: id,
          taskType: "PARKING",
          trackingSessionId: id,
          valetSessionId: id,
          vehicle: {
            color: null,
            make: null,
            model: null,
            plateCountry: null,
            plateNumber: null,
            temporaryDescriptor: "Blue vehicle",
            vehicleId: id,
          },
        },
      ],
      nextCursor: null,
      observedAt: "2026-08-15T10:00:00.000Z",
    };
    expect(liveOperationsMapResponseSchema.parse(response)).toEqual(response);
    expect(
      liveOperationsMapResponseSchema.safeParse({
        ...response,
        items: [{ ...response.items[0], userId: id }],
      }).success,
    ).toBe(false);
  });
});
