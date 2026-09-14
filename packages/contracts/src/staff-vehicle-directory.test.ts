import { describe, expect, it } from "vitest";

import {
  staffVehicleDirectoryQuerySchema,
  staffVehicleDirectoryResponseSchema,
  staffVehicleDirectoryRowSchema,
} from "./staff-vehicle-directory.js";

function baseRow(): Record<string, unknown> {
  return {
    createdAt: "2026-08-25T10:00:00.000Z",
    keySlotCode: null,
    keySlotVisibility: "UNASSIGNED",
    parkingSpotCode: null,
    parkingZoneCode: null,
    sessionId: "22222222-2222-4222-8222-222222222222",
    state: "AWAITING_PARKING",
    updatedAt: "2026-08-25T10:05:00.000Z",
    vehicle: {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
  };
}

describe("staffVehicleDirectory contracts", () => {
  it("validates a fully populated supervisor row with key slot code", () => {
    const payload = {
      ...baseRow(),
      keySlotCode: "K-03",
      keySlotVisibility: "VISIBLE",
      parkingSpotCode: "A-01",
      parkingZoneCode: "ZONE-A",
      state: "PARKED",
    };

    const parsed = staffVehicleDirectoryRowSchema.parse(payload);
    expect(parsed).toEqual(payload);
  });

  it("accepts nullable operational fields on a queued row", () => {
    const parsed = staffVehicleDirectoryRowSchema.parse(baseRow());
    expect(parsed.keySlotCode).toBeNull();
    expect(parsed.parkingSpotCode).toBeNull();
    expect(parsed.parkingZoneCode).toBeNull();
  });

  it("distinguishes restricted masking from a genuine missing assignment", () => {
    expect(
      staffVehicleDirectoryRowSchema.parse({
        ...baseRow(),
        keySlotVisibility: "RESTRICTED",
      }).keySlotVisibility,
    ).toBe("RESTRICTED");
    expect(() =>
      staffVehicleDirectoryRowSchema.parse({
        ...baseRow(),
        keySlotCode: "K-SECRET",
        keySlotVisibility: "RESTRICTED",
      }),
    ).toThrow("Key Slot code does not match its visibility");
    expect(() =>
      staffVehicleDirectoryRowSchema.parse({
        ...baseRow(),
        keySlotVisibility: "VISIBLE",
      }),
    ).toThrow("Key Slot code does not match its visibility");
  });

  it("rejects COMPLETED as a directory row state", () => {
    const payload = { ...baseRow(), state: "COMPLETED" };
    expect(() => staffVehicleDirectoryRowSchema.parse(payload)).toThrow();
  });

  it("rejects unknown extra fields on rows (strict)", () => {
    const payload = { ...baseRow(), version: 3 };
    expect(() => staffVehicleDirectoryRowSchema.parse(payload)).toThrow();
  });

  it("rejects missing required row fields", () => {
    const payload = baseRow();
    delete payload.updatedAt;
    expect(() => staffVehicleDirectoryRowSchema.parse(payload)).toThrow();
  });

  it("rejects non-uuid sessionId and invalid timestamps", () => {
    expect(() =>
      staffVehicleDirectoryRowSchema.parse({
        ...baseRow(),
        sessionId: "not-a-uuid",
      }),
    ).toThrow();
    expect(() =>
      staffVehicleDirectoryRowSchema.parse({
        ...baseRow(),
        createdAt: "2026-08-25 10:00:00",
      }),
    ).toThrow();
  });

  it("validates a valid capped response page", () => {
    const payload = {
      locationId: "11111111-1111-4111-8111-111111111111",
      rows: [baseRow()],
      truncated: false,
    };

    const parsed = staffVehicleDirectoryResponseSchema.parse(payload);
    expect(parsed.truncated).toBe(false);
    expect(parsed.rows).toHaveLength(1);
  });

  it("requires truncated and rejects unknown response fields", () => {
    const locationId = "11111111-1111-4111-8111-111111111111";
    expect(() =>
      staffVehicleDirectoryResponseSchema.parse({
        locationId,
        rows: [],
      }),
    ).toThrow();
    expect(() =>
      staffVehicleDirectoryResponseSchema.parse({
        locationId,
        rows: [],
        total: 5,
        truncated: false,
      }),
    ).toThrow();
  });

  it("keeps query validation strict on locationId", () => {
    expect(
      staffVehicleDirectoryQuerySchema.parse({
        locationId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({ locationId: "11111111-1111-4111-8111-111111111111" });
    expect(() =>
      staffVehicleDirectoryQuerySchema.parse({ locationId: "abc" }),
    ).toThrow();
    expect(() => staffVehicleDirectoryQuerySchema.parse({})).toThrow();
    expect(() =>
      staffVehicleDirectoryQuerySchema.parse({
        locationId: "11111111-1111-4111-8111-111111111111",
        organizationId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toThrow();
  });
});
