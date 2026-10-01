import { describe, expect, it } from "vitest";
import {
  createParkingZoneRequestSchema,
  parkingZoneSelectorSchema,
  physicalResourceLabelSchema,
} from "./physical-resource-configuration.js";

const operationId = "11111111-2222-4333-8444-555555555555";
const request = { operationId, code: " Z:a-١ ", label: " منطقة أمامية " };

describe("Issue #236 Parking Zone creation", () => {
  it("trims boundaries while preserving case, punctuation and Arabic", () => {
    expect(createParkingZoneRequestSchema.parse(request)).toEqual({
      operationId,
      code: "Z:a-١",
      label: "منطقة أمامية",
    });
    expect(
      createParkingZoneRequestSchema.parse({ ...request, code: "z:A-١" }).code,
    ).toBe("z:A-١");
  });
  it.each([
    { operationId: "bad" },
    { code: " \t " },
    { label: " \n " },
    { code: "x".repeat(101) },
    { label: "x".repeat(161) },
    { organizationId: operationId },
    { status: "ACTIVE" },
  ])("rejects invalid values and unknown authority fields: %j", (patch) => {
    expect(
      createParkingZoneRequestSchema.safeParse({ ...request, ...patch })
        .success,
    ).toBe(false);
  });
  it("accepts exact length boundaries and returns only the existing selector", () => {
    expect(
      createParkingZoneRequestSchema.parse({
        operationId,
        code: "x".repeat(100),
        label: "x".repeat(160),
      }).label,
    ).toHaveLength(160);
    const response = {
      parkingZoneId: operationId,
      code: "Z:a-١",
      label: "منطقة أمامية",
      status: "ACTIVE",
    };
    expect(parkingZoneSelectorSchema.parse(response)).toEqual(response);
    expect(
      parkingZoneSelectorSchema.safeParse({ ...response, qrPayload: "zone" })
        .success,
    ).toBe(false);
    expect(
      physicalResourceLabelSchema.safeParse({ resourceType: "PARKING_ZONE" })
        .success,
    ).toBe(false);
  });
});
