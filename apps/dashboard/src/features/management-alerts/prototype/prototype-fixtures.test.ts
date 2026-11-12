import { describe, expect, it } from "vitest";

import {
  categoryCoverageFixtures,
  filterAttention,
  initialAlerts,
  missingDestinationAlert,
  organizationAlert,
  presenceExpiryAlert,
  restrictedAlt17Alert,
  roleScopedAlerts,
  scopedAlerts,
  unauthorizedDestinationAlert,
} from "./fixtures";
import {
  SYNTHETIC_INCIDENT_SOURCE_ID,
  SYNTHETIC_INCIDENT_TARGET_ID,
} from "./types";

describe("synthetic management alert fixtures", () => {
  it("keeps ALT-15 organization-only, Company Admin-only and location-free", () => {
    const event = organizationAlert;
    expect(event.category).toBe("ALT-15");
    expect(event.kind).toBe("OCCURRENCE");
    expect(event.location).toBeNull();
    expect(event.destination).toMatchObject({
      state: "unavailable",
      sourceId: "SIM-ORG-STAFF-41",
    });

    const locationA = scopedAlerts("multiple", "downtown");
    const locationB = scopedAlerts("multiple", "west");
    const caA = roleScopedAlerts(locationA, [event], "company-admin");
    const caB = roleScopedAlerts(locationB, [event], "company-admin");
    expect(caA.find((item) => item.category === "ALT-15")?.id).toBe(event.id);
    expect(caB.find((item) => item.category === "ALT-15")?.id).toBe(event.id);
    expect(roleScopedAlerts(locationA, [event], "location-manager")).toEqual(locationA);
    expect(roleScopedAlerts(locationA, [event], "unauthorized")).toEqual([]);

    const seen = new Set([event.id]);
    expect(filterAttention(caA, seen).some((item) => item.category === "ALT-15")).toBe(false);
    expect(filterAttention(caB, seen).some((item) => item.category === "ALT-15")).toBe(false);
    expect(filterAttention(caB, new Set()).some((item) => item.category === "ALT-15")).toBe(true);
  });

  it("keeps ALT-17 excluded and overflow destinations unavailable", () => {
    const alerts = initialAlerts("overflow");
    expect(alerts.some((item) => item.category === "ALT-17")).toBe(false);
    expect(alerts.every((item) => item.destination.state === "unavailable")).toBe(true);
    expect(roleScopedAlerts([restrictedAlt17Alert], [], "company-admin")).toEqual([]);
    expect(filterAttention([restrictedAlt17Alert], new Set())).toEqual([]);
  });

  it("exposes one local synthetic ALT-08 target and distinct unavailable, missing and unauthorized states", () => {
    const incident = categoryCoverageFixtures.find((item) => item.id === SYNTHETIC_INCIDENT_SOURCE_ID);
    expect(incident?.category).toBe("ALT-08");
    expect(incident?.destination).toEqual({
      state: "available",
      sourceId: SYNTHETIC_INCIDENT_SOURCE_ID,
      targetId: SYNTHETIC_INCIDENT_TARGET_ID,
    });

    expect(categoryCoverageFixtures
      .filter((item) => item.id !== SYNTHETIC_INCIDENT_SOURCE_ID)
      .every((item) => item.destination.state === "unavailable")).toBe(true);

    expect(missingDestinationAlert.destination).toMatchObject({
      state: "missing",
      sourceId: "SIM-INC-MISSING-1042",
      targetId: SYNTHETIC_INCIDENT_TARGET_ID,
      reason: "synthetic-target-missing",
    });
    expect(unauthorizedDestinationAlert.destination).toMatchObject({
      state: "unauthorized",
      sourceId: "SIM-INC-UNAUTHORIZED-1042",
      targetId: SYNTHETIC_INCIDENT_TARGET_ID,
      reason: "synthetic-target-unauthorized",
    });
    expect(new Set(initialAlerts("destination-unavailable").map((item) => item.destination.state)))
      .toEqual(new Set(["unavailable", "missing", "unauthorized"]));
  });

  it("covers all ordinary-bell categories, maps ALT-08 HIGH to Important, and keeps CA-only sources scoped", () => {
    const categories = new Set(categoryCoverageFixtures.map((item) => item.category));
    expect(categories).toEqual(new Set([
      "ALT-01", "ALT-02", "ALT-03", "ALT-04", "ALT-05", "ALT-06", "ALT-07",
      "ALT-08", "ALT-09", "ALT-10", "ALT-11", "ALT-12", "ALT-13", "ALT-15", "ALT-16",
    ]));
    expect(categories.has("ALT-14")).toBe(false);
    expect(categories.has("ALT-17")).toBe(false);
    const highIncident = categoryCoverageFixtures.find((item) =>
      item.category === "ALT-08" && item.sourceSeverity === "HIGH",
    );
    expect(highIncident?.severity).toBe("IMPORTANT");
    expect(highIncident?.sourceStatus).toBe("OPEN");

    const forceEnd = categoryCoverageFixtures.find((item) => item.category === "ALT-13");
    const takeover = categoryCoverageFixtures.find((item) => item.category === "ALT-05");
    expect(forceEnd).toBeDefined();
    expect(takeover).toBeDefined();
    expect(roleScopedAlerts([forceEnd!, takeover!], [], "location-manager")
      .map((item) => item.category)).toEqual(["ALT-13"]);
    expect(roleScopedAlerts([takeover!], [], "company-admin")).toEqual([takeover]);
  });

  it("expires occurrences at the exclusive seven-day boundary and expires ALT-12 at equality", () => {
    const now = Date.now();
    const occurrence = organizationAlert;
    const beforeBoundary = {
      ...occurrence,
      id: "SIM-ALT15-BEFORE-BOUNDARY",
      time: new Date(now - 7 * 24 * 60 * 60 * 1000 + 1).toISOString(),
    };
    const atBoundary = {
      ...occurrence,
      id: "SIM-ALT15-BOUNDARY",
      time: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const beyondBoundary = {
      ...occurrence,
      id: "SIM-ALT15-EXPIRED",
      time: new Date(now - 7 * 24 * 60 * 60 * 1000 - 1).toISOString(),
    };
    expect(filterAttention([beforeBoundary], new Set(), now)).toHaveLength(1);
    expect(filterAttention([atBoundary], new Set(), now)).toHaveLength(0);
    expect(filterAttention([beyondBoundary], new Set(), now)).toHaveLength(0);

    expect(presenceExpiryAlert.category).toBe("ALT-12");
    expect(filterAttention([
      { ...presenceExpiryAlert, expiresAt: new Date(now).toISOString() },
    ], new Set(), now)).toHaveLength(0);
  });
});
