import { describe, expect, it } from "vitest";

import type { ManagementAuditAuthorization } from "../src/modules/management/management-audit-authorization";
import { projectManagementAuditEvent } from "../src/modules/management/management-audit-projection";
import type { ManagementAuditQueryRow } from "../src/modules/management/management-audit-query";

const userId = "35d16402-ae1a-4853-8218-a59cdf0d2317";
const organizationId = "35d16402-ae1a-4853-8218-a59cdf0d2318";
const locationId = "35d16402-ae1a-4853-8218-a59cdf0d2319";
const membershipId = "35d16402-ae1a-4853-8218-a59cdf0d231a";
const eventId = "35d16402-ae1a-4853-8218-a59cdf0d231b";

const admin: ManagementAuditAuthorization = {
  organizationId,
  membershipId,
  locationId: null,
  role: "ORG_ADMIN",
  scope: "ORGANIZATION",
};

function row(metadataJson: unknown): ManagementAuditQueryRow {
  return {
    actorMembershipId: membershipId,
    actorType: "MEMBERSHIP",
    createdAt: new Date("2026-11-04T10:00:00Z"),
    entityId: userId,
    entityType: "User",
    eventType: "MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED",
    id: eventId,
    locationId: null,
    metadataJson,
    occurredAt: new Date("2026-11-04T10:00:00Z"),
    organizationId,
    valetSessionId: null,
  };
}

describe("Issue #414 safe known Management alert timing audit projection", () => {
  it("projects only the approved key names, revision and User ID", () => {
    const projected = projectManagementAuditEvent(
      row({
        changedKeys: "alt02QueueSeconds,alt11UnknownPaymentSeconds",
        beforeRevision: 0,
        afterRevision: 1,
        alt02QueueSeconds: 100,
        guestAccessToken: "forbidden-private-token",
        paymentProviderKey: "forbidden-private-provider",
      }),
      admin,
    );
    expect(projected).toEqual({
      actor: { type: "MEMBERSHIP", membershipId },
      details: {
        kind: "MANAGEMENT",
        changedKeys: ["alt02QueueSeconds", "alt11UnknownPaymentSeconds"],
        beforeRevision: 0,
        afterRevision: 1,
      },
      entity: null,
      eventId,
      eventType: "MANAGEMENT_ALERT_TIMING_PREFERENCES_CHANGED",
      occurredAt: "2026-11-04T10:00:00.000Z",
      scope: { kind: "ORGANIZATION" },
    });
    expect(JSON.stringify(projected)).not.toContain("forbidden-private");
    expect(JSON.stringify(projected)).not.toContain('alt02QueueSeconds":100');
  });

  it("fails closed to a minimal known detail for untrusted or malformed metadata", () => {
    for (const input of [
      {
        changedKeys: "alt02QueueSeconds,secretAccessToken",
        beforeRevision: 0,
        afterRevision: 1,
      },
      {
        changedKeys: "alt02QueueSeconds,alt02QueueSeconds",
        beforeRevision: 0,
        afterRevision: 1,
      },
      { changedKeys: "alt02QueueSeconds", beforeRevision: 1, afterRevision: 1 },
      {
        changedKeys: "alt02QueueSeconds",
        beforeRevision: -1,
        afterRevision: 1,
      },
      {
        changedKeys: ["alt02QueueSeconds"],
        beforeRevision: 0,
        afterRevision: 1,
      },
      null,
    ]) {
      const projected = projectManagementAuditEvent(row(input), admin);
      expect(projected.details).toEqual({ kind: "MANAGEMENT" });
    }
  });

  it("rejects LM/Supervisor projection and a falsely Location-scoped event", () => {
    const metadataJson = {
      changedKeys: "alt01GraceSeconds",
      beforeRevision: 0,
      afterRevision: 1,
    };
    for (const role of ["LOCATION_MANAGER", "VALET_SUPERVISOR"] as const) {
      expect(() =>
        projectManagementAuditEvent(
          { ...row(metadataJson), locationId },
          {
            ...admin,
            role,
            locationId,
            scope: "LOCATION",
          },
        ),
      ).toThrow("not location-visible");
    }
    expect(() =>
      projectManagementAuditEvent({ ...row(metadataJson), locationId }, admin),
    ).toThrow("not location-visible");
  });
});
