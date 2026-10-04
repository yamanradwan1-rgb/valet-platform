import { describe, expect, it } from "vitest";

import {
  shiftPresenceChallengeIntentSchema,
  shiftPresenceEvidenceSchema,
  shiftPresenceOperationStatusResponseSchema,
} from "./shift-presence-public.js";
import {
  shiftPresenceCompanySetRequestSchema,
  shiftPresenceLocationClearRequestSchema,
  shiftPresenceZoneCreateRequestSchema,
  shiftPresenceManagementResultQuerySchema,
} from "./shift-presence-management.js";
import {
  endShiftRequestSchema,
  startShiftRequestSchema,
  startShiftResponseSchema,
} from "./shifts.js";

const id = "d3b736ce-19e0-441b-923f-a3bb76f589ad";

describe("GPS-B transport freeze and legacy compatibility", () => {
  it("requires an exact resource selector for zone/exception result correlation", () => {
    for (const kind of ["ZONE", "EXCEPTION"]) {
      expect(
        shiftPresenceManagementResultQuerySchema.safeParse({
          kind,
          entityId: id,
        }).success,
      ).toBe(true);
      expect(
        shiftPresenceManagementResultQuerySchema.safeParse({ kind }).success,
      ).toBe(false);
      expect(
        shiftPresenceManagementResultQuerySchema.safeParse({
          kind,
          entityId: id,
          label: "equal state",
        }).success,
      ).toBe(false);
    }
    expect(
      shiftPresenceManagementResultQuerySchema.safeParse({ kind: "POLICY" })
        .success,
    ).toBe(true);
  });
  it("keeps old Start/End bodies and strict success shape", () => {
    expect(startShiftRequestSchema.parse({ targetLocationId: id })).toEqual({
      targetLocationId: id,
    });
    expect(endShiftRequestSchema.parse({ cashReported: "0.000" })).toEqual({
      cashReported: "0.000",
    });
    const response = {
      shiftId: id,
      locationId: id,
      status: "ACTIVE",
      startedAt: "2026-10-04T10:00:00Z",
      endedAt: null,
    };
    expect(startShiftResponseSchema.safeParse(response).success).toBe(true);
    expect(
      startShiftResponseSchema.safeParse({ ...response, presence: {} }).success,
    ).toBe(false);
  });
  it("requires actual cash in END intent, rejecting authority-bearing additions", () => {
    expect(
      shiftPresenceChallengeIntentSchema.safeParse({
        action: "END",
        shiftId: id,
        operationId: id,
      }).success,
    ).toBe(false);
    const intent = {
      action: "END",
      shiftId: id,
      operationId: id,
      cashReported: "1.001",
    };
    expect(shiftPresenceChallengeIntentSchema.safeParse(intent).success).toBe(
      true,
    );
    for (const property of [
      "organizationId",
      "membershipId",
      "inside",
      "policy",
    ]) {
      expect(
        shiftPresenceChallengeIntentSchema.safeParse({
          ...intent,
          [property]: id,
        }).success,
      ).toBe(false);
    }
  });
  it("rejects nonfinite/out-of-range fixes and client inside claims", () => {
    const evidence = {
      kind: "MEASURED",
      operationId: id,
      challengeId: id,
      clientSampleId: id,
      measurement: {
        latitude: 31,
        longitude: 35,
        accuracyMeters: 1,
        capturedAt: "2026-10-04T10:00:00Z",
      },
    };
    expect(shiftPresenceEvidenceSchema.safeParse(evidence).success).toBe(true);
    for (const value of [NaN, Infinity, 91]) {
      expect(
        shiftPresenceEvidenceSchema.safeParse({
          ...evidence,
          measurement: { ...evidence.measurement, latitude: value },
        }).success,
      ).toBe(false);
    }
    expect(
      shiftPresenceEvidenceSchema.safeParse({ ...evidence, inside: true })
        .success,
    ).toBe(false);
  });
  it("strictly separates per-field CAS, inherited context and CLEAR from OFF", () => {
    const set = {
      field: "shiftStartPresenceMode",
      value: "OFF",
      expectedRevision: 1,
      mutationId: id,
    };
    expect(shiftPresenceCompanySetRequestSchema.safeParse(set).success).toBe(
      true,
    );
    expect(
      shiftPresenceCompanySetRequestSchema.safeParse({
        ...set,
        expectedRevision: 0,
      }).success,
    ).toBe(false);
    expect(
      shiftPresenceCompanySetRequestSchema.safeParse({ ...set, value: 1 })
        .success,
    ).toBe(false);
    const clear = {
      field: set.field,
      mutationId: id,
      expectedRevision: 1,
      expectedCompanyRevision: 1,
      configurationFingerprint: "a".repeat(64),
    };
    expect(
      shiftPresenceLocationClearRequestSchema.safeParse(clear).success,
    ).toBe(true);
    expect(
      shiftPresenceLocationClearRequestSchema.safeParse({
        ...clear,
        value: "OFF",
      }).success,
    ).toBe(false);
    expect(
      shiftPresenceLocationClearRequestSchema.safeParse({
        ...clear,
        expectedCompanyRevision: undefined,
      }).success,
    ).toBe(false);
  });
  it("rejects raw fixes in result projection and generic state setters in zones", () => {
    const status = {
      state: "RECOVERABLE",
      operationId: id,
      action: "START",
      status: "DENIED",
      shiftId: null,
      decisionId: null,
      denialReason: "APPROVER_AUTHORITY_REVOKED",
      summary: null,
    };
    expect(
      shiftPresenceOperationStatusResponseSchema.safeParse(status).success,
    ).toBe(true);
    expect(
      shiftPresenceOperationStatusResponseSchema.safeParse({
        ...status,
        latitude: 31,
      }).success,
    ).toBe(false);
    const zone = {
      mutationId: id,
      zoneId: id,
      code: "ENTRY",
      label: "Entry",
      latitude: 31,
      longitude: 35,
      radiusMeters: 50,
      state: "ACTIVE",
    };
    expect(shiftPresenceZoneCreateRequestSchema.safeParse(zone).success).toBe(
      true,
    );
    expect(
      shiftPresenceZoneCreateRequestSchema.safeParse({
        ...zone,
        state: "DELETED",
      }).success,
    ).toBe(false);
  });
});
