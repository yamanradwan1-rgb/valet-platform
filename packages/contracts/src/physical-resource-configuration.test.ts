import { describe, expect, it } from "vitest";

import {
  createKeySlotRequestSchema,
  createParkingSpotRequestSchema,
  physicalResourceCodeSchema,
  physicalResourceLabelSchema,
  physicalResourceListQuerySchema,
} from "./physical-resource-configuration.js";

const id = "11111111-2222-4333-8444-555555555555";

describe("Issue #232 physical resource contracts", () => {
  it("trims only boundaries and caps resource codes at 100", () => {
    expect(physicalResourceCodeSchema.parse("  k-03:A  ")).toBe("k-03:A");
    expect(physicalResourceCodeSchema.parse("X".repeat(100))).toHaveLength(100);
    expect(physicalResourceCodeSchema.safeParse("X".repeat(101)).success).toBe(false);
  });

  it("keeps create requests strict and ownership-free", () => {
    expect(createKeySlotRequestSchema.parse({ operationId: id, code: " K-01 " }))
      .toEqual({ operationId: id, code: "K-01" });
    expect(createParkingSpotRequestSchema.parse({
      operationId: id,
      code: "P-01",
      label: " Front Row 01 ",
      parkingZoneId: id,
    })).toEqual({ operationId: id, code: "P-01", label: "Front Row 01", parkingZoneId: id });
    expect(createKeySlotRequestSchema.safeParse({
      operationId: id,
      code: "K-01",
      organizationId: id,
    }).success).toBe(false);
  });

  it("bounds list queries and accepts the canonical V2 label projection", () => {
    expect(physicalResourceListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(physicalResourceListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    const label = physicalResourceLabelSchema.parse({
      code: "K-01",
      location: { code: "AMM", locationId: id, name: "Amman" },
      qrPayload: `vaylet:v2:key-slot:${id}:K-01`,
      resourceId: id,
      resourceType: "KEY_SLOT",
      version: "V2",
    });
    expect(label.resourceId).toBe(id);
  });
});
