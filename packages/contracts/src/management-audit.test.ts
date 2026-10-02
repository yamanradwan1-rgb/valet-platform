import { describe, expect, it } from "vitest";

import {
  managementAuditKnownEventTypes,
  managementAuditLocationQuerySchema,
  managementAuditOrganizationQuerySchema,
  managementAuditResponseSchema,
} from "./index.js";

const eventId = "018f1234-5678-4abc-9234-56789abcdef0";
const locationId = "018f1234-5678-4abc-9234-56789abcdef1";
const membershipId = "018f1234-5678-4abc-9234-56789abcdef2";

describe("management audit contracts", () => {
  it("publishes the exact bounded current event catalog", () => {
    expect(managementAuditKnownEventTypes).toHaveLength(91);
    expect(new Set(managementAuditKnownEventTypes)).toHaveLength(91);
    expect(managementAuditKnownEventTypes).toContain("SHIFT_FORCE_ENDED");
    expect(managementAuditKnownEventTypes).toContain("PARKING_ZONE_CREATED");
    expect(managementAuditKnownEventTypes).toContain(
      "MANAGEMENT_LOCATION_SLA_TARGET_CHANGED",
    );
    expect(managementAuditKnownEventTypes).toContain("LOCATION_DEACTIVATED");
    expect(managementAuditKnownEventTypes).toContain(
      "VISIT_CONTACT_NAME_CORRECTED",
    );
    expect(managementAuditKnownEventTypes).toContain(
      "VISIT_CONTACT_PHONE_CORRECTED",
    );
    expect(managementAuditKnownEventTypes).toContain("KEY_SLOT_CREATED");
    expect(managementAuditKnownEventTypes).toContain("PARKING_SPOT_CREATED");
  });

  it("parses strict organization filters with the bounded default page", () => {
    expect(
      managementAuditOrganizationQuerySchema.parse({
        eventType: "VALET_SESSION_PARKED",
        locationId,
      }),
    ).toEqual({
      eventType: "VALET_SESSION_PARKED",
      limit: 50,
      locationId,
    });
    expect(
      managementAuditOrganizationQuerySchema.safeParse({
        locationId,
        search: "metadata",
      }).success,
    ).toBe(false);
    expect(
      managementAuditOrganizationQuerySchema.safeParse({
        eventType: "FUTURE_EVENT",
      }).success,
    ).toBe(false);
    expect(
      managementAuditOrganizationQuerySchema.safeParse({ limit: 101 }).success,
    ).toBe(false);
  });

  it("keeps the location route filter scope strict", () => {
    expect(managementAuditLocationQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      managementAuditLocationQuerySchema.safeParse({ locationId }).success,
    ).toBe(false);
    expect(
      managementAuditLocationQuerySchema.safeParse({ cursor: "A".repeat(4097) })
        .success,
    ).toBe(false);
  });

  it("accepts only the safe known-event response projection", () => {
    const parsed = managementAuditResponseSchema.parse({
      items: [
        {
          actor: { membershipId, type: "MEMBERSHIP" },
          details: {
            fromState: "PARKING",
            fromVersion: 2,
            kind: "SESSION",
            toState: "PARKED",
            toVersion: 3,
          },
          entity: { id: eventId, type: "VALET_SESSION" },
          eventId,
          eventType: "VALET_SESSION_PARKED",
          occurredAt: "2026-09-17T00:00:00.000Z",
          scope: { kind: "LOCATION", locationId },
        },
      ],
      nextCursor: null,
    });
    expect(parsed.items[0]?.eventType).toBe("VALET_SESSION_PARKED");
  });

  it("allows only a minimal UNKNOWN fallback and rejects passthrough fields", () => {
    const minimal = {
      details: { kind: "UNKNOWN" },
      entity: null,
      eventId,
      eventType: "UNKNOWN",
      occurredAt: "2026-09-17T00:00:00.000Z",
      scope: { kind: "ORGANIZATION" },
    };
    expect(
      managementAuditResponseSchema.parse({
        items: [minimal],
        nextCursor: null,
      }),
    ).toBeDefined();
    expect(
      managementAuditResponseSchema.safeParse({
        items: [{ ...minimal, metadata: { reason: "private" } }],
        nextCursor: null,
      }).success,
    ).toBe(false);
    expect(
      managementAuditResponseSchema.safeParse({
        items: [{ ...minimal, eventType: "FUTURE_EVENT" }],
        nextCursor: null,
      }).success,
    ).toBe(false);
  });
});
