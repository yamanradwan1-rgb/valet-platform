import { describe, expect, it } from "vitest";

import {
  staffValetSessionDetailResponseSchema,
  staffValetSessionGuestAccessSchema,
  staffValetSessionStateSchema,
} from "./staff-valet-session.js";

function basePayload(): Record<string, unknown> {
  return {
    checkIn: {
      conditionCompletedAt: "2026-08-21T18:00:00.000Z",
    },
    handoff: { pendingAt: null, verification: null },
    keySlot: null,
    locationId: "11111111-1111-4111-8111-111111111111",
    parking: {
      parkedAt: "2026-08-21T18:05:00.000Z",
      parkingSpotCode: "B-17",
      parkingStartedAt: "2026-08-21T18:02:00.000Z",
      parkingZoneCode: "ZONE-B",
    },
    sessionId: "22222222-2222-4222-8222-222222222222",
    state: "PARKED",
    vehicle: {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId: "33333333-3333-4333-8333-333333333333",
      vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
    },
    version: 5,
  };
}

describe("staffValetSession contracts", () => {
  it("validates full valid detail response payload", () => {
    const payload = {
      ...basePayload(),
      guestAccess: {
        expiresAt: "2026-08-22T18:05:00.123Z",
        revokedAt: null,
        status: "ACTIVE",
      },
    };

    const parsed = staffValetSessionDetailResponseSchema.parse(payload);
    expect(parsed).toEqual(payload);
  });

  it("validates minimal checking-in payload with nullable fields", () => {
    const payload = {
      checkIn: {
        conditionCompletedAt: null,
      },
    handoff: { pendingAt: null, verification: null },

      guestAccess: {
        expiresAt: null,
        revokedAt: null,
        status: "NOT_ISSUED",
      },
      keySlot: null,
      locationId: "11111111-1111-4111-8111-111111111111",
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId: "22222222-2222-4222-8222-222222222222",
      state: "CHECKING_IN",
      vehicle: {
        color: null,
        make: null,
        model: null,
        plateCountry: null,
        plateNumberRaw: null,
        temporaryDescriptor: "Red SUV with dented bumper",
        vehicleId: "33333333-3333-4333-8333-333333333333",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 1,
    };

    const parsed = staffValetSessionDetailResponseSchema.parse(payload);
    expect(parsed.state).toBe("CHECKING_IN");
    expect(parsed.keySlot).toBeNull();
    expect(parsed.checkIn.conditionCompletedAt).toBeNull();
  });

  it("rejects unknown extra fields due to strict schema", () => {
    const payload = {
      checkIn: {
        conditionCompletedAt: null,
      },
    handoff: { pendingAt: null, verification: null },

      customerPhone: "+962790000000",
      guestAccess: {
        expiresAt: null,
        revokedAt: null,
        status: "NOT_ISSUED",
      },
      keySlot: null,
      locationId: "11111111-1111-4111-8111-111111111111",
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId: "22222222-2222-4222-8222-222222222222",
      state: "CHECKING_IN",
      vehicle: {
        color: null,
        make: null,
        model: null,
        plateCountry: null,
        plateNumberRaw: null,
        temporaryDescriptor: "Draft",
        vehicleId: "33333333-3333-4333-8333-333333333333",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 1,
    };

    expect(() => staffValetSessionDetailResponseSchema.parse(payload)).toThrow();
  });

  it("accepts all canonical states in staffValetSessionStateSchema", () => {
    const states = [
      "CHECKING_IN",
      "AWAITING_PARKING",
      "PARKING",
      "PARKED",
      "REQUESTED",
      "RETRIEVING",
      "READY",
      "HANDOFF_PENDING",
      "COMPLETED",
    ];

    for (const state of states) {
      expect(staffValetSessionStateSchema.parse(state)).toBe(state);
    }
  });
});

describe("staffValetSessionGuestAccess safe projection", () => {
  it.each([
    [
      "NOT_ISSUED",
      { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
    ],
    [
      "ACTIVE",
      {
        expiresAt: "2026-08-22T18:05:00.123Z",
        revokedAt: null,
        status: "ACTIVE",
      },
    ],
    [
      "EXPIRED",
      {
        expiresAt: "2026-08-20T18:05:00.000Z",
        revokedAt: null,
        status: "EXPIRED",
      },
    ],
    [
      "REVOKED",
      {
        expiresAt: "2026-08-22T18:05:00.000Z",
        revokedAt: "2026-08-21T19:30:00.456Z",
        status: "REVOKED",
      },
    ],
  ])("accepts the %s state payload", (_status, guestAccess) => {
    const parsed = staffValetSessionGuestAccessSchema.parse(guestAccess);
    expect(parsed).toEqual(guestAccess);
  });

  it("rejects unknown status values", () => {
    expect(() =>
      staffValetSessionGuestAccessSchema.parse({
        expiresAt: null,
        revokedAt: null,
        status: "ISSUED",
      }),
    ).toThrow();
  });

  it("rejects credential material fields due to strict schema", () => {
    const payload = {
      expiresAt: null,
      rawToken: "a".repeat(43),
      revokedAt: null,
      status: "ACTIVE",
      tokenHash: "sha256:v1:abc",
    };
    expect(() =>
      staffValetSessionDetailResponseSchema.parse({
        ...basePayload(),
        guestAccess: payload,
      }),
    ).toThrow();
  });

  it("rejects a detail response without the guestAccess projection", () => {
    const full = {
      ...basePayload(),
      guestAccess: {
        expiresAt: null,
        revokedAt: null,
        status: "ACTIVE" as const,
      },
    };
    const { guestAccess, ...withoutGuestAccess } = full;
    void guestAccess;
    expect(() =>
      staffValetSessionDetailResponseSchema.parse(withoutGuestAccess),
    ).toThrow();
  });
});
