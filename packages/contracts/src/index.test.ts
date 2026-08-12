import { describe, expect, it } from "vitest";

import {
  activeShiftQuerySchema,
  activeShiftResponseSchema,
  assignKeySlotRequestSchema,
  clearKeySlotRequestSchema,
  keySlotAssignmentProjectionSchema,
  nonEmptyStringSchema,
  staffAuthAccessResponseSchema,
  staffLoginRequestSchema,
  startShiftRequestSchema,
  startShiftResponseSchema,
} from "./index";

describe("nonEmptyStringSchema", () => {
  it("accepts non-empty bootstrap values", () => {
    expect(nonEmptyStringSchema.parse("valet-platform")).toBe("valet-platform");
  });
});

describe("Shift contracts", () => {
  it("keeps requests strict and location-bound", () => {
    const locationId = "00000000-0000-4000-8000-000000000001";
    expect(
      startShiftRequestSchema.parse({ targetLocationId: locationId }),
    ).toEqual({ targetLocationId: locationId });
    expect(
      startShiftRequestSchema.safeParse({
        membershipId: "00000000-0000-4000-8000-000000000002",
        targetLocationId: locationId,
      }).success,
    ).toBe(false);
    expect(
      activeShiftQuerySchema.safeParse({
        locationId,
        organizationId: "00000000-0000-4000-8000-000000000003",
      }).success,
    ).toBe(false);
  });

  it("validates projections and a null active result", () => {
    const shift = {
      endedAt: null,
      locationId: "00000000-0000-4000-8000-000000000001",
      shiftId: "00000000-0000-4000-8000-000000000002",
      startedAt: "2026-08-12T10:00:00.000Z",
      status: "ACTIVE",
    };
    expect(startShiftResponseSchema.parse(shift)).toEqual(shift);
    expect(activeShiftResponseSchema.parse({ shift: null })).toEqual({
      shift: null,
    });
  });
});

describe("Key custody contracts", () => {
  it("trims the exact slot code and rejects authority fields", () => {
    expect(
      assignKeySlotRequestSchema.parse({
        expectedVersion: 3,
        keySlotCode: "  Board-A-01  ",
      }),
    ).toEqual({ expectedVersion: 3, keySlotCode: "Board-A-01" });
    expect(
      assignKeySlotRequestSchema.safeParse({
        expectedVersion: 3,
        keySlotCode: "Board-A-01",
        locationId: "00000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
    expect(
      clearKeySlotRequestSchema.safeParse({
        expectedVersion: 3,
        keySlotId: "00000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);
    expect(
      assignKeySlotRequestSchema.safeParse({
        expectedVersion: 1.5,
        keySlotCode: "Board-A-01",
      }).success,
    ).toBe(false);
    expect(
      assignKeySlotRequestSchema.safeParse({
        expectedVersion: 1,
        keySlotCode: "   ",
      }).success,
    ).toBe(false);
  });

  it("locks the minimal authorized assignment projection", () => {
    expect(
      keySlotAssignmentProjectionSchema.parse({
        keySlotCode: null,
        sessionId: "00000000-0000-4000-8000-000000000001",
        state: "AWAITING_PARKING",
        version: 4,
      }),
    ).toBeDefined();
  });
});

describe("staff authentication contracts", () => {
  it("normalizes email without changing the exact password", () => {
    expect(
      staffLoginRequestSchema.parse({
        email: "  STAFF@Example.COM  ",
        password: "  exact password  ",
      }),
    ).toEqual({
      email: "staff@example.com",
      password: "  exact password  ",
    });
  });

  it("rejects authority fields and passwords beyond 1024 UTF-8 bytes", () => {
    expect(
      staffLoginRequestSchema.safeParse({
        email: "staff@example.com",
        organizationId: "client-authority",
        password: "password",
      }).success,
    ).toBe(false);
    expect(
      staffLoginRequestSchema.safeParse({
        email: "staff@example.com",
        password: "é".repeat(513),
      }).success,
    ).toBe(false);
  });

  it("locks the opaque access response shape", () => {
    expect(
      staffAuthAccessResponseSchema.parse({
        accessExpiresAt: "2026-08-10T12:15:00.000Z",
        accessToken: `vsa1.${"a".repeat(43)}`,
        sessionExpiresAt: "2026-09-09T12:00:00.000Z",
        tokenType: "Bearer",
      }),
    ).toBeDefined();
  });
});
