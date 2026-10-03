import { describe, expect, it } from "vitest";
import {
  managementAuditKnownEventTypes,
  managementAuditEntityTypeSchema,
  managementAuditEventSchema,
} from "@valet/contracts";
import { auditEventLabel } from "./audit-event-copy";
import { auditEntityLabel } from "./audit-event-labels";
import {
  auditScopeLabel,
  auditTimeContext,
  formatAuditTime,
} from "./audit-presentation";
import { auditDetailValue } from "./audit-detail-values";

const event = managementAuditEventSchema.parse({
  eventId: "11111111-1111-4111-8111-111111111111",
  occurredAt: "2026-09-21T22:30:00Z",
  scope: {
    kind: "LOCATION",
    locationId: "22222222-2222-4222-8222-222222222222",
  },
  actor: { type: "SYSTEM" },
  entity: null,
  eventType: "LOCATION_ACTIVATED",
  details: { kind: "MANAGEMENT" },
});

describe("Audit human presentation", () => {
  it.each(managementAuditKnownEventTypes)(
    "labels %s in both languages",
    (type) => {
      expect(auditEventLabel(type, "en")).not.toBe(type);
      expect(auditEventLabel(type, "ar")).toMatch(/[\u0600-\u06ff]/u);
    },
  );
  it.each(managementAuditEntityTypeSchema.options)(
    "labels target %s without UUID",
    (type) => {
      const target = managementAuditEventSchema.parse({
        ...event,
        entity: { id: event.eventId, type },
      });
      expect(auditEntityLabel(target, "en")).not.toBe(type);
      expect(auditEntityLabel(target, "ar")).toMatch(/[\u0600-\u06ff]/u);
      expect(auditEntityLabel(target, "en")).not.toContain(event.eventId);
    },
  );
  it("keeps unknown semantics minimal", () => {
    expect(auditEventLabel("UNKNOWN", "en")).toBe("Unknown event");
    expect(auditEventLabel("UNKNOWN", "ar")).toBe("حدث غير معروف");
  });
  it("uses explicit timezone including day rollover and year", () => {
    expect(formatAuditTime(event.occurredAt, "UTC", "en")).toContain(
      "Sep 21, 2026",
    );
    expect(formatAuditTime(event.occurredAt, "Asia/Amman", "en")).toContain(
      "Sep 22, 2026",
    );
    expect(formatAuditTime(event.occurredAt, "bad-zone", "en")).toBe(
      "Time unavailable",
    );
  });
  it("never borrows a selected Location name for another event scope", () => {
    const context = {
      locationId: "foreign",
      name: "Other Location",
      timezone: "UTC",
    };
    expect(auditScopeLabel(event, context, "en")).toBe("Location");
    expect(
      auditScopeLabel(
        { ...event, scope: { kind: "ORGANIZATION" } },
        context,
        "en",
      ),
    ).toBe("Organization");
  });
  it("humanizes allowlisted values but preserves literal safe text", () => {
    expect(auditDetailValue("STAFF", "newRole", "ORG_ADMIN", "en")).toBe(
      "Company Admin",
    );
    expect(auditDetailValue("SESSION", "toState", "PARKED", "ar")).toBe(
      "مصطفّة",
    );
    expect(auditDetailValue("CONFIGURATION", "operation", "CLEAR", "ar")).toBe(
      "إزالة",
    );
    expect(
      auditDetailValue("CONFIGURATION", "settingKey", "ACTIVE", "en"),
    ).toBe("ACTIVE");
    const malicious = "<img src=x onerror=alert(1)>";
    expect(
      auditDetailValue("CONFIGURATION", "settingKey", malicious, "en"),
    ).toBe(malicious);
    expect(auditDetailValue("MANAGEMENT", "acceptingIntake", false, "ar")).toBe(
      "لا",
    );
  });
});

describe("Audit timezone authority", () => {
  const organization = {
    organizationId: event.eventId,
    name: "Company",
    timezone: "Asia/Amman",
  };
  const location = {
    locationId: event.eventId,
    name: "Garage",
    code: "G",
    status: "ACTIVE" as const,
    timezone: "America/New_York",
    currency: "USD",
  };
  it("uses UTC for Organization scope even when Company timezone is supplied", () => {
    expect(
      auditTimeContext({
        authority: "COMPANY_ADMIN",
        context: {
          organization,
          scope: { kind: "ALL_LOCATIONS" },
          selectedLocation: null,
          capabilities: [],
        },
      }).timezone,
    ).toBe("UTC");
  });
  it("uses the authoritative exact Location timezone for CA and LM", () => {
    expect(
      auditTimeContext({
        authority: "COMPANY_ADMIN",
        context: {
          organization,
          scope: { kind: "LOCATION", locationId: location.locationId },
          selectedLocation: location,
          capabilities: [],
        },
      }).timezone,
    ).toBe("America/New_York");
    expect(
      auditTimeContext({
        authority: "LOCATION_MANAGER",
        organization,
        location,
      }).timezone,
    ).toBe("America/New_York");
  });
  it("labels only the existing Audit cancellation event and terminal transition in EN/AR", () => {
    expect(auditEventLabel("VALET_SESSION_CHECK_IN_CANCELLED", "en")).toBe(
      "Check-in cancelled",
    );
    expect(auditEventLabel("VALET_SESSION_CHECK_IN_CANCELLED", "ar")).toMatch(
      /[\u0600-\u06ff]/u,
    );
    expect(auditDetailValue("CHECK_IN", "toState", "CANCELLED", "en")).toBe(
      "Cancelled",
    );
    expect(auditDetailValue("CHECK_IN", "toState", "CANCELLED", "ar")).toMatch(
      /[\u0600-\u06ff]/u,
    );
  });
});
