import { describe, expect, it } from "vitest";
import {
  shiftPresenceChallengeResponseSchema,
  shiftPresenceOperationStatusResponseSchema,
} from "./shift-presence-public.js";
import { shiftPresenceRecoveryResponseSchema } from "./shift-presence-result.js";
import { shiftPresenceMeasuredDenialExceptionReason } from "./shift-presence-consumer.js";

const id = "d3b736ce-19e0-441b-923f-a3bb76f589ad";
const challenge = {
  operationId: id,
  challengeId: id,
  action: "START",
  locationId: id,
  shiftId: null,
  issuedAt: "2026-10-04T10:00:00Z",
  expiresAt: "2026-10-04T10:05:00Z",
  presence: { mode: "OFF", maxAccuracyMeters: 50, maxFixAgeSeconds: 30 },
};
const denied = {
  state: "RECOVERABLE",
  operationId: id,
  action: "START",
  status: "DENIED",
  shiftId: null,
  decisionId: null,
  denialReason: "PRESENCE_REJECTED",
  summary: { classification: "CONFIDENT_OUTSIDE", reason: "OUTSIDE" },
};

describe("GPS-B employee consumer policy and minimized exact denial", () => {
  it("maps server outcomes without turning configuration failure into outside", () => {
    expect(
      shiftPresenceMeasuredDenialExceptionReason({
        classification: "CONFIDENT_OUTSIDE",
        reason: "OUTSIDE",
      }),
    ).toBe("OUTSIDE_ZONE");
    expect(
      shiftPresenceMeasuredDenialExceptionReason({
        classification: "AMBIGUOUS_EDGE",
        reason: "EDGE",
      }),
    ).toBe("AMBIGUOUS_FIX");
    for (const reason of [
      "INVALID_FIX",
      "INACCURATE_FIX",
      "STALE_FIX",
      "FUTURE_FIX",
    ] as const)
      expect(
        shiftPresenceMeasuredDenialExceptionReason({
          classification: "MEASUREMENT_UNUSABLE",
          reason,
        }),
      ).toBe("GPS_UNAVAILABLE");
    for (const reason of ["NO_ACTIVE_ZONE", "INVALID_CONFIGURATION"] as const)
      expect(
        shiftPresenceMeasuredDenialExceptionReason({
          classification: "CONFIGURATION_UNUSABLE",
          reason,
        }),
      ).toBeNull();
    expect(() =>
      shiftPresenceMeasuredDenialExceptionReason({
        classification: "CONFIDENT_OUTSIDE",
        reason: "EDGE",
      }),
    ).toThrow();
  });
  it("recovers an unknown exception selector by exact PENDING status only", () => {
    for (const exceptionId of [null, id]) {
      expect(
        shiftPresenceRecoveryResponseSchema.safeParse({
          state: "PENDING",
          operationId: id,
          exceptionId,
        }).success,
      ).toBe(true);
    }
    expect(
      shiftPresenceRecoveryResponseSchema.safeParse({
        state: "PENDING",
        operationId: id,
      }).success,
    ).toBe(false);
    expect(
      shiftPresenceRecoveryResponseSchema.safeParse({
        state: "PENDING",
        operationId: id,
        exceptionId: id,
        measurement: {},
      }).success,
    ).toBe(false);
  });
  it.each(["OFF", "WARN_ONLY", "REQUIRE", "REQUIRE_OR_OVERRIDE"])(
    "requires exact bounded action guidance for %s",
    (mode) => {
      expect(
        shiftPresenceChallengeResponseSchema.safeParse({
          ...challenge,
          presence: { ...challenge.presence, mode },
        }).success,
      ).toBe(true);
      expect(
        shiftPresenceChallengeResponseSchema.safeParse({
          ...challenge,
          action: "END",
          shiftId: id,
          presence: { mode, maxAccuracyMeters: 1, maxFixAgeSeconds: 120 },
        }).success,
      ).toBe(true);
    },
  );
  it("rejects unbounded and internal policy projections", () => {
    for (const presence of [
      undefined,
      { ...challenge.presence, maxAccuracyMeters: 201 },
      { ...challenge.presence, maxAccuracyMeters: 1.5 },
      { ...challenge.presence, maxFixAgeSeconds: 0 },
      { ...challenge.presence, zoneIds: [id] },
      { ...challenge.presence, policyFingerprint: "a".repeat(64) },
      { ...challenge.presence, company: {} },
    ])
      expect(
        shiftPresenceChallengeResponseSchema.safeParse({
          ...challenge,
          presence,
        }).success,
      ).toBe(false);
  });
  it.each([
    ["CONFIDENT_OUTSIDE", "OUTSIDE"],
    ["AMBIGUOUS_EDGE", "EDGE"],
    ["MEASUREMENT_UNUSABLE", "INVALID_FIX"],
    ["MEASUREMENT_UNUSABLE", "INACCURATE_FIX"],
    ["MEASUREMENT_UNUSABLE", "STALE_FIX"],
    ["MEASUREMENT_UNUSABLE", "FUTURE_FIX"],
    ["CONFIGURATION_UNUSABLE", "NO_ACTIVE_ZONE"],
    ["CONFIGURATION_UNUSABLE", "INVALID_CONFIGURATION"],
  ])(
    "recovers the consistent minimized %s/%s pair",
    (classification, reason) => {
      expect(
        shiftPresenceRecoveryResponseSchema.safeParse({
          ...denied,
          summary: { classification, reason },
          result: null,
        }).success,
      ).toBe(true);
    },
  );
  it("requires null summary for unrelated denials and historical unknown facts", () => {
    for (const denialReason of [
      "PRESENCE_REQUIRED",
      "APPROVER_AUTHORITY_REVOKED",
    ]) {
      expect(
        shiftPresenceOperationStatusResponseSchema.safeParse({
          ...denied,
          denialReason,
          summary: null,
        }).success,
      ).toBe(true);
      expect(
        shiftPresenceOperationStatusResponseSchema.safeParse({
          ...denied,
          denialReason,
        }).success,
      ).toBe(false);
    }
    expect(
      shiftPresenceOperationStatusResponseSchema.safeParse({
        ...denied,
        summary: null,
      }).success,
    ).toBe(true);
    expect(
      shiftPresenceOperationStatusResponseSchema.safeParse({
        ...denied,
        summary: undefined,
      }).success,
    ).toBe(false);
  });
  it("rejects contradictory summaries and private evidence", () => {
    for (const summary of [
      { classification: "CONFIDENT_OUTSIDE", reason: "EDGE" },
      { classification: "CONFIDENT_INSIDE", reason: "INSIDE" },
      { ...denied.summary, latitude: 31.95 },
      { ...denied.summary, capturedAt: challenge.issuedAt },
    ])
      expect(
        shiftPresenceRecoveryResponseSchema.safeParse({
          ...denied,
          summary,
          result: null,
        }).success,
      ).toBe(false);
    for (const status of ["COMMITTED", "EXPIRED"]) {
      expect(
        shiftPresenceOperationStatusResponseSchema.safeParse({
          ...denied,
          status,
        }).success,
      ).toBe(false);
    }
  });
});
