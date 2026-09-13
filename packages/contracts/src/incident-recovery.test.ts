import { describe, expect, it } from "vitest";
import {
  incidentRecoveryMarkerSchema,
  incidentRecoveryParamsSchema,
  incidentRecoveryResponseSchema,
  legacyIncidentIdSchema,
} from "./incident-recovery";

const recoveryId = "018f1234-5678-8abc-9234-56789abcdef0";
const legacyId = "018f1234-5678-4abc-9234-56789abcdef0";

describe("Incident recovery contracts", () => {
  it("distinguishes strict recovery UUIDv8 and legacy UUIDv4 identities", () => {
    expect(
      incidentRecoveryParamsSchema.parse({
        incidentId: recoveryId,
        sessionId: legacyId,
      }),
    ).toBeDefined();
    expect(() =>
      incidentRecoveryParamsSchema.parse({
        incidentId: legacyId,
        sessionId: legacyId,
      }),
    ).toThrow();
    expect(legacyIncidentIdSchema.parse(legacyId)).toBe(legacyId);
    expect(() => legacyIncidentIdSchema.parse(recoveryId)).toThrow();
  });

  it("accepts only the four canonical outcomes", () => {
    for (const outcome of ["RETIRED", "UNKNOWN"] as const) {
      expect(
        incidentRecoveryResponseSchema.parse({
          incidentId: recoveryId,
          outcome,
          sessionId: legacyId,
        }).outcome,
      ).toBe(outcome);
    }
    expect(
      incidentRecoveryResponseSchema.parse({
        expiresAt: "2026-09-12T12:15:00.000Z",
        incidentId: recoveryId,
        outcome: "RESERVED",
        sessionId: legacyId,
      }).outcome,
    ).toBe("RESERVED");
    expect(() =>
      incidentRecoveryResponseSchema.parse({
        incidentId: recoveryId,
        outcome: "ABSENT",
        sessionId: legacyId,
      }),
    ).toThrow();
  });

  it("keeps the marker strict and excludes user/content/secrets", () => {
    const marker = {
      createdAt: "2026-09-12T12:00:00.000Z",
      incidentId: recoveryId,
      installationGeneration: "installation-1",
      locationId: legacyId,
      membershipId: "018f1234-5678-4abc-a234-56789abcdef1",
      organizationId: "018f1234-5678-4abc-a234-56789abcdef2",
      protocol: "actor-bound-intent-v1",
      sessionId: "018f1234-5678-4abc-a234-56789abcdef3",
      version: 1,
    } as const;
    expect(incidentRecoveryMarkerSchema.parse(marker)).toEqual(marker);
    for (const forbidden of [
      "userId",
      "description",
      "type",
      "severity",
      "body",
      "payloadHash",
      "authorization",
      "accessToken",
      "refreshToken",
    ]) {
      expect(() =>
        incidentRecoveryMarkerSchema.parse({
          ...marker,
          [forbidden]: "canary",
        }),
      ).toThrow();
    }
  });
});
