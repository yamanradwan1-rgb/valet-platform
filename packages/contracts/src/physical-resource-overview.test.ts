import { describe, expect, it } from "vitest";
import {
  physicalResourceOverviewQuerySchema,
  physicalResourceOverviewResponseSchema,
} from "./physical-resource-overview.js";

const ID = "00000000-0000-4000-8000-000000000001";

describe("Issue #304 physical-resource overview contract", () => {
  it("accepts independent bounded cursors and rejects excess input", () => {
    expect(physicalResourceOverviewQuerySchema.parse({})).toEqual({
      limit: 50,
    });
    expect(
      physicalResourceOverviewQuerySchema.parse({ limit: "100" }).limit,
    ).toBe(100);
    expect(
      physicalResourceOverviewQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
    expect(
      physicalResourceOverviewQuerySchema.safeParse({ limit: 0 }).success,
    ).toBe(false);
    expect(
      physicalResourceOverviewQuerySchema.safeParse({ other: "scope" }).success,
    ).toBe(false);
  });

  it("preserves unknown availability as nullable counts, not fake zeros", () => {
    const response = {
      counts: {
        keySlots: {
          configured: 6,
          active: 5,
          available: null,
          inUse: null,
          unknown: 6,
        },
        parkingSpots: {
          configured: 4,
          active: 3,
          available: null,
          occupied: null,
          unknown: 4,
        },
      },
      keySlots: {
        items: [
          {
            keySlotId: ID,
            code: "K-01",
            status: "INACTIVE",
            label: null,
            usage: "UNKNOWN",
            holdingSessionId: null,
            holdingVehicle: null,
          },
        ],
        nextCursor: null,
      },
      parkingSpots: { items: [], nextCursor: null },
    };
    expect(physicalResourceOverviewResponseSchema.parse(response)).toEqual(
      response,
    );
    expect(
      physicalResourceOverviewResponseSchema.safeParse({
        ...response,
        counts: {
          ...response.counts,
          keySlots: { ...response.counts.keySlots, available: "0" },
        },
      }).success,
    ).toBe(false);
  });

  it("requires an explicit vehicle identity object for a current holder", () => {
    const key = {
      keySlotId: ID,
      code: "K-01",
      status: "ACTIVE",
      label: null,
      usage: "IN_USE",
      holdingSessionId: ID,
      holdingVehicle: {
        plateNumberNormalized: null,
        temporaryDescriptor: null,
      },
    };
    const base = {
      counts: {
        keySlots: {
          configured: 1,
          active: 1,
          available: 0,
          inUse: 1,
          unknown: 0,
        },
        parkingSpots: {
          configured: 0,
          active: 0,
          available: 0,
          occupied: 0,
          unknown: 0,
        },
      },
      keySlots: { items: [key], nextCursor: null },
      parkingSpots: { items: [], nextCursor: null },
    };
    expect(physicalResourceOverviewResponseSchema.safeParse(base).success).toBe(
      true,
    );
    expect(
      physicalResourceOverviewResponseSchema.safeParse({
        ...base,
        keySlots: {
          items: [{ ...key, holdingVehicle: null }],
          nextCursor: null,
        },
      }).success,
    ).toBe(false);
  });
});
