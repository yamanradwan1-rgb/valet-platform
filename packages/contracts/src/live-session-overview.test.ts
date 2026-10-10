import { describe, expect, it } from "vitest";
import {
  liveSessionOverviewEntrySchema,
  liveSessionOverviewCursorSchema,
  liveSessionOverviewListResponseSchema,
  historicalStaffNameSchema,
} from "./live-session-overview.js";
import { sessionOverviewEntrySchema } from "./location-overview.js";

const id = "77777777-7777-4777-8777-777777777701";
const name = { firstName: "Nora", lastName: "Haddad" };
const base = {
  sessionId: id,
  state: "PARKED",
  createdAt: "2026-09-21T10:00:00.000Z",
  updatedAt: "2026-09-21T12:00:00.000Z",
  currentAssigneeMembershipId: null,
  keySlotId: null,
  parkingSpotId: null,
  activeTask: null,
  keySlot: null,
  parkingSpot: null,
  parkingZone: null,
  vehicle: {
    vehicleId: id,
    make: null,
    model: null,
    color: null,
    plateCountry: null,
    plateNumberNormalized: null,
    temporaryDescriptor: null,
  },
};

describe("DEC-102 purpose-specific Live sessions contract", () => {
  it("preserves old strict Vehicles entry unmodified", () => {
    expect(sessionOverviewEntrySchema.parse(base)).toEqual(base);
    expect(
      sessionOverviewEntrySchema.safeParse({
        ...base,
        checkedInBy: name,
      }).success,
    ).toBe(false);
  });

  it("accepts coherent proven completion with a projected or missing identity", () => {
    for (const parkedBy of [name, null]) {
      expect(
        liveSessionOverviewEntrySchema.parse({
          ...base,
          checkedInBy: name,
          parkedBy,
          parkingCompletionProof: "PROVEN",
        }).parkedBy,
      ).toEqual(parkedBy);
    }
    expect(
      liveSessionOverviewListResponseSchema.parse({
        items: [
          {
            ...base,
            checkedInBy: null,
            parkedBy: null,
            parkingCompletionProof: "NO_RECORD",
          },
        ],
        nextCursor: null,
      }).items,
    ).toHaveLength(1);
  });

  it("rejects historical names under NO_RECORD and UNVERIFIABLE", () => {
    for (const parkingCompletionProof of ["NO_RECORD", "UNVERIFIABLE"]) {
      expect(
        liveSessionOverviewEntrySchema.safeParse({
          ...base,
          checkedInBy: name,
          parkedBy: name,
          parkingCompletionProof,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects extra historical identifiers/emails, partial and invalid names", () => {
    for (const historicalName of [
      { ...name, email: "nora@example.test" },
      { ...name, membershipId: id },
      { firstName: " ", lastName: "Haddad" },
      { firstName: " Nora", lastName: "Haddad" },
      { firstName: "Nora", lastName: "" },
      { firstName: "a".repeat(101), lastName: "Haddad" },
      { firstName: "Nora" },
    ]) {
      expect(historicalStaffNameSchema.safeParse(historicalName).success).toBe(
        false,
      );
    }
    expect(
      liveSessionOverviewEntrySchema.safeParse({
        ...base,
        checkedInBy: name,
        parkedBy: name,
        parkingCompletionProof: "PROVEN",
        userId: id,
      }).success,
    ).toBe(false);
  });

  it("rejects old endpoint cursor domain and foreign filter", () => {
    const cursor = {
      v: 3,
      d: "live-sessions",
      organizationId: id,
      locationId: id,
      filter: "ALL",
      sortKey: base.createdAt,
      tiebreakerId: id,
    };
    expect(liveSessionOverviewCursorSchema.parse(cursor)).toEqual(cursor);
    expect(
      liveSessionOverviewCursorSchema.safeParse({
        ...cursor,
        v: 2,
        d: "sessions",
      }).success,
    ).toBe(false);
    expect(
      liveSessionOverviewCursorSchema.safeParse({
        ...cursor,
        filter: "FOREIGN",
      }).success,
    ).toBe(false);
  });
});
