import { describe, expect, it } from "vitest";
import { alertBadge, previewSchemaForLocation } from "./alert-model";
import { managementAlertsLocation } from "./alert-scope";
import {
  defaultAlertTimingValues,
  timingPreferencesSchema,
  validAlertTimingValues,
} from "./alert-timing-contract";
import type { SelectedDashboardScope } from "../../components/scope";

const incident = {
  id: "alert-1",
  category: "ALT-08",
  severity: "IMPORTANT",
  sourceKind: "INCIDENT",
  sourceId: "incident-1",
  episodeId: "open-1",
  locationId: "location-a",
  occurredAt: "2026-11-04T08:00:00.000Z",
  title: "High-priority incident",
};

describe("Phase-1 preview boundary", () => {
  it("accepts bounded scope-correct cases and displays 20+ overflow", () => {
    const parsed = previewSchemaForLocation("location-a").safeParse({
      items: [{ ...incident }, { ...incident, id: "alert-2", severity: "CRITICAL" }],
      count: 20,
      hasMore: true,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(alertBadge(parsed.data)).toBe("20+");
    expect(parsed.data.items[0]?.severity).toBe("CRITICAL");
    expect(alertBadge({ items: [], count: 0, hasMore: false })).toBe("0");
  });

  it("rejects foreign Location and mismatched source/category even in a count", () => {
    const schema = previewSchemaForLocation("location-a");
    expect(schema.safeParse({
      items: [{ ...incident, locationId: "location-b" }],
      count: 1, hasMore: false,
    }).success).toBe(false);
    expect(schema.safeParse({
      items: [{ ...incident, category: "ALT-01" }],
      count: 1, hasMore: false,
    }).success).toBe(false);
    expect(schema.safeParse({ items: [], count: -1, hasMore: false }).success).toBe(false);
    expect(schema.safeParse({ items: [], count: 21, hasMore: false }).success).toBe(false);
    expect(schema.safeParse({ items: [incident], count: 0, hasMore: false }).success).toBe(false);
    expect(schema.safeParse({ items: [], count: 0 }).success).toBe(false);
  });
});

describe("DEC-109 own-user timing policy", () => {
  it("enforces six exact integer values and the accepted inclusive maxima", () => {
    expect(validAlertTimingValues(defaultAlertTimingValues)).toBe(true);
    expect(validAlertTimingValues({
      ...defaultAlertTimingValues, alt01GraceSeconds: 60,
      alt02QueueSeconds: 300, alt03DeclineSeconds: 120,
      alt04StageSeconds: 900, alt06HandoffSeconds: 900,
      alt11UnknownPaymentSeconds: 600,
    })).toBe(true);
    for (const [key, value] of [
      ["alt01GraceSeconds", 61],
      ["alt02QueueSeconds", 301],
      ["alt03DeclineSeconds", -1],
      ["alt04StageSeconds", 0],
      ["alt06HandoffSeconds", 901],
      ["alt11UnknownPaymentSeconds", 601],
      ["alt01GraceSeconds", 0.5],
    ] as const) {
      expect(validAlertTimingValues({
        ...defaultAlertTimingValues, [key]: value,
      })).toBe(false);
    }
    expect(validAlertTimingValues({
      ...defaultAlertTimingValues, arbitraryPollingSeconds: 1,
    })).toBe(false);
    expect(validAlertTimingValues({
      ...defaultAlertTimingValues, alt02QueueSeconds: 47,
    })).toBe(true);
  });

  it("rejects a cross-Organization preference response", () => {
    const payload = {
      organizationId: "organization-a",
      userId: "self",
      revision: 0,
      updatedAt: null,
      values: defaultAlertTimingValues,
    };
    expect(timingPreferencesSchema("organization-a").safeParse(payload).success).toBe(true);
    expect(timingPreferencesSchema("organization-b").safeParse(payload).success).toBe(false);
    expect(timingPreferencesSchema("organization-a").safeParse({
      ...payload, revision: -1,
    }).success).toBe(false);
  });
});

describe("Management bell audience", () => {
  it("rejects CA All Locations, inactive Location, and subscription-only grants", () => {
    const ca = {
      authority: "COMPANY_ADMIN",
      context: {
        scope: { kind: "LOCATION", locationId: "location-a" },
        selectedLocation: { locationId: "location-a", status: "ACTIVE" },
      },
    } as unknown as SelectedDashboardScope;
    expect(managementAlertsLocation(ca)).toBe("location-a");
    expect(managementAlertsLocation({
      ...ca, context: {
        ...("context" in ca ? ca.context : {}),
        scope: { kind: "ALL_LOCATIONS" },
      },
    } as SelectedDashboardScope)).toBeNull();
    expect(managementAlertsLocation({
      authority: "COMPANY_ADMIN_SUBSCRIPTION",
      organization: { organizationId: "organization-a" },
    } as SelectedDashboardScope)).toBeNull();
    expect(managementAlertsLocation({
      authority: "LOCATION_MANAGER",
      location: { locationId: "location-b", status: "INACTIVE" },
    } as SelectedDashboardScope)).toBeNull();
  });
});
