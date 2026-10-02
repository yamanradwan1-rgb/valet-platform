import { describe, expect, it } from "vitest";

import { keySlotOverviewEntrySchema } from "./location-overview.js";
import {
  parkingSpotConfigurationSchema,
  parkingSpotListEntrySchema,
} from "./physical-resource-configuration.js";

const id = "11111111-2222-4333-8444-555555555555";
const vehicle = { plateNumberNormalized: "12345", temporaryDescriptor: null };
const key = {
  keySlotId: id,
  code: "K-1",
  slotStatus: "ACTIVE",
  holdingSessionId: id,
  holdingVehicle: vehicle,
};
const spot = {
  parkingSpotId: id,
  code: "P-1",
  label: "Front",
  status: "ACTIVE",
  parkingZone: null,
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};
const occupancy = { sessionId: id, sessionState: "PARKED", vehicle };

describe("Issue #254 strict resource projections", () => {
  it("preserves key usage and enforces holder/vehicle consistency", () => {
    expect(keySlotOverviewEntrySchema.parse(key)).toEqual(key);
    expect(
      keySlotOverviewEntrySchema.parse({
        ...key,
        holdingSessionId: null,
        holdingVehicle: null,
      }).holdingVehicle,
    ).toBeNull();
    for (const patch of [
      { holdingVehicle: undefined },
      { holdingVehicle: null },
      { holdingSessionId: null },
      { holdingVehicle: { ...vehicle, customerPhone: "private" } },
    ])
      expect(
        keySlotOverviewEntrySchema.safeParse({ ...key, ...patch }).success,
      ).toBe(false);
  });

  it("distinguishes active availability, occupancy and historical configuration", () => {
    expect(
      parkingSpotListEntrySchema.parse({ ...spot, occupancy }).occupancy,
    ).toEqual(occupancy);
    expect(
      parkingSpotListEntrySchema.parse({ ...spot, occupancy: null }).occupancy,
    ).toBeNull();
    expect(parkingSpotListEntrySchema.parse(spot)).not.toHaveProperty(
      "occupancy",
    );
    expect(parkingSpotConfigurationSchema.parse(spot)).toEqual(spot);
    expect(
      parkingSpotConfigurationSchema.safeParse({ ...spot, occupancy }).success,
    ).toBe(false);
  });

  it("rejects malformed or overexposed operational facts", () => {
    for (const value of [
      { ...occupancy, sessionId: "invalid" },
      { ...occupancy, sessionState: "COMPLETED" },
      { ...occupancy, sessionState: "invented" },
      { ...occupancy, vehicle: { ...vehicle, vehicleId: id } },
      { ...occupancy, vehicle: { plateNumberNormalized: 123 } },
      { ...occupancy, staffName: "private" },
    ])
      expect(
        parkingSpotListEntrySchema.safeParse({ ...spot, occupancy: value })
          .success,
      ).toBe(false);
  });
});
