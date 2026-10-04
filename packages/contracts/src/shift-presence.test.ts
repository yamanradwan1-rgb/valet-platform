import { describe, expect, it } from "vitest";

import {
  shiftPresenceCompanyPolicySchema,
  shiftPresenceLocationPolicySchema,
  shiftPresenceModeSchema,
  resolveShiftPresencePolicy,
} from "./shift-presence-policy.js";
import { shiftPresenceDecisionSchema, shiftPresenceZoneSchema } from "./shift-presence.js";

const id = "00000000-0000-4000-8000-000000000001";
const company = {
  startMode: "OFF", endMode: "OFF", maxAccuracyMeters: 50,
  maxFixAgeSeconds: 30, revision: 1,
} as const;
const location = {
  startModeOverride: null, endModeOverride: null,
  maxAccuracyMetersOverride: null, maxFixAgeSecondsOverride: null, revision: 1,
};

describe("DEC-099 typed foundation", () => {
  it.each(["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"])("parses %s", (mode) => {
    expect(shiftPresenceModeSchema.parse(mode)).toBe(mode);
  });
  it("rejects unknown modes and fields", () => {
    expect(shiftPresenceModeSchema.safeParse("ON").success).toBe(false);
    expect(shiftPresenceCompanyPolicySchema.safeParse({ ...company, inside: true }).success).toBe(false);
    expect(shiftPresenceLocationPolicySchema.safeParse({ ...location, policy: {} }).success).toBe(false);
  });
  it("inherits per-field, and explicit OFF overrides strict Company policy", () => {
    expect(resolveShiftPresencePolicy(company, location)).toEqual({ startMode: "OFF", endMode: "OFF",
      maxAccuracyMeters: 50, maxFixAgeSeconds: 30, companyRevision: 1, locationRevision: 1 });
    expect(resolveShiftPresencePolicy({ ...company, startMode: "REQUIRE" }, {
      ...location, startModeOverride: "OFF", maxFixAgeSecondsOverride: 60,
    })).toMatchObject({ startMode: "OFF", maxAccuracyMeters: 50, maxFixAgeSeconds: 60 });
  });
  it.each([0, 201, NaN, Infinity, 1.5])("rejects accuracy threshold %s", (value) => {
    expect(shiftPresenceCompanyPolicySchema.safeParse({ ...company, maxAccuracyMeters: value }).success).toBe(false);
  });
  it.each([0, 121, NaN, Infinity, 1.5])("rejects age threshold %s", (value) => {
    expect(shiftPresenceCompanyPolicySchema.safeParse({ ...company, maxFixAgeSeconds: value }).success).toBe(false);
  });
  it("bounds configuration coordinates and labels", () => {
    const zone = { id, organizationId: id, locationId: id, code: "ENTRY", label: "Entry",
      latitude: 90, longitude: -180, radiusMeters: 5, state: "ACTIVE", revision: 1 };
    expect(shiftPresenceZoneSchema.safeParse(zone).success).toBe(true);
    for (const patch of [{ code: " " }, { label: "x".repeat(201) }, { latitude: NaN },
      { longitude: Infinity }, { radiusMeters: 4 }, { radiusMeters: 1001 }]) {
      expect(shiftPresenceZoneSchema.safeParse({ ...zone, ...patch }).success).toBe(false);
    }
  });
  it("makes employee coordinates and arbitrary metadata impossible in decision contracts", () => {
    const decision = { organizationId: id, locationId: id, userId: id, membershipId: id,
      action: "START", shiftId: null, operationId: id, challengeId: id,
      policyFingerprint: "b".repeat(64),
      appliedMode: "OFF", companyPolicyRevision: 1, locationPolicyRevision: 1,
      zoneId: null, zoneRevision: null, classification: "CONFIDENT_INSIDE", reason: "INSIDE",
      accuracyBand: "ACCEPTABLE", freshnessBand: "ACCEPTABLE", exceptionId: null };
    expect(shiftPresenceDecisionSchema.safeParse(decision).success).toBe(true);
    for (const patch of [{ latitude: 1 }, { longitude: 2 }, { metadata: {} }, { accuracyMeters: 5 },
      { requestFingerprint: "a".repeat(64) }, { capturedAt: "2026-10-04T00:00:00Z" },
      { distance: 1 }, { requestPayload: {} }]) {
      expect(shiftPresenceDecisionSchema.safeParse({ ...decision, ...patch }).success).toBe(false);
    }
    expect(shiftPresenceDecisionSchema.safeParse({ ...decision, action: "END" }).success).toBe(false);
    expect(shiftPresenceDecisionSchema.safeParse({ ...decision, reason: "OUTSIDE" }).success).toBe(false);
    expect(shiftPresenceDecisionSchema.safeParse({ ...decision, freshnessBand: "NOT_EVALUATED" }).success).toBe(false);
  });
});
