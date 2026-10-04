import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  shiftPresenceManagementResultSchema,
  shiftPresenceZoneResponseSchema,
} from "./shift-presence-management.js";
import { shiftPresencePublicErrorCodeSchema } from "./shift-presence-public-errors.js";

const id = randomUUID();
const readiness = {
  applicability: "NOT_APPLICABLE",
  configurationUsable: false,
  strictActivationAllowed: false,
  activeZoneCount: 0,
  blockers: [],
  companyRevision: 1,
  locationRevision: 1,
  configurationFingerprint: "a".repeat(64),
  observedAt: "2026-10-04T12:00:00.000Z",
};
const absent = {
  mutationId: id,
  attribution: "UNKNOWN",
  effect: null,
  entityId: null,
  revision: null,
  canonical: { kind: "ZONE", value: { zone: null, readiness } },
};
describe("revised GPS-B strict management result contract", () => {
  it("represents absent Zone as UNKNOWN with current readiness; ordinary Zone GET stays nonnullable", () => {
    expect(shiftPresenceManagementResultSchema.safeParse(absent).success).toBe(
      true,
    );
    expect(
      shiftPresenceZoneResponseSchema.safeParse(absent.canonical.value).success,
    ).toBe(false);
  });
  it("accepts exact terminal NO_CHANGE identity with a positive unchanged policy revision", () => {
    const result = {
      mutationId: id,
      attribution: "COMMITTED",
      effect: "NO_CHANGE",
      entityId: id,
      revision: 1,
      canonical: {
        kind: "POLICY",
        value: {
          organizationId: id,
          policy: {
            startMode: "OFF",
            endMode: "OFF",
            maxAccuracyMeters: 50,
            maxFixAgeSeconds: 30,
            revision: 1,
          },
          capabilities: { canEdit: true, strictActivationAllowed: false },
        },
      },
    };
    expect(shiftPresenceManagementResultSchema.safeParse(result).success).toBe(
      true,
    );
    expect(
      shiftPresenceManagementResultSchema.safeParse({ ...result, revision: 0 })
        .success,
    ).toBe(false);
  });
  it("rejects raw request material, untyped effects and generic absent states", () => {
    for (const result of [
      { ...absent, latitude: 31 },
      { ...absent, effect: "REPLAYED" },
      { ...absent, attribution: "ROLLED_BACK" },
      {
        ...absent,
        canonical: {
          ...absent.canonical,
          value: { ...absent.canonical.value, body: { cashReported: "12" } },
        },
      },
    ])
      expect(
        shiftPresenceManagementResultSchema.safeParse(result).success,
      ).toBe(false);
  });
  it("publishes the controlled presence rate-limit code", () => {
    expect(
      shiftPresencePublicErrorCodeSchema.parse("SHIFT_PRESENCE_RATE_LIMITED"),
    ).toBe("SHIFT_PRESENCE_RATE_LIMITED");
  });
  it("rejects attribution/effect contradictions and committed absent Zone", () => {
    for (const result of [
      { ...absent, effect: "CHANGED" },
      { ...absent, entityId: id },
      {
        ...absent,
        attribution: "COMMITTED",
        effect: "CHANGED",
        entityId: id,
        revision: 1,
      },
    ])
      expect(
        shiftPresenceManagementResultSchema.safeParse(result).success,
      ).toBe(false);
  });
});
