import { describe, expect, it } from "vitest";

import {
  allowsDashboardCommercialRequirement,
  allowsDashboardRouteAccessRequirement,
  commercialAccessFromSubscription,
  noDashboardCommercialAccess,
} from "./dashboard-commercial-access";

function subscription(dashboardAccess: boolean, basicBranding: boolean) {
  return {
    planCode: "TEST",
    status: "ACTIVE" as const,
    entitlements: {
      dashboardAccess,
      reportExports: false,
      basicBranding,
    },
  };
}

describe("dashboard commercial access", () => {
  it("keeps subscription read available for a null subscription", () => {
    const access = commercialAccessFromSubscription(null);
    expect(allowsDashboardCommercialRequirement("SUBSCRIPTION_READ", access)).toBe(true);
    expect(allowsDashboardCommercialRequirement("DASHBOARD", access)).toBe(false);
    expect(allowsDashboardCommercialRequirement("BRANDING", access)).toBe(false);
  });

  it("requires dashboard access for normal Management routes", () => {
    const access = commercialAccessFromSubscription(subscription(false, true));
    expect(allowsDashboardCommercialRequirement("DASHBOARD", access)).toBe(false);
  });

  it("requires both dashboard and basic-branding entitlements for Branding", () => {
    const brandOnly = commercialAccessFromSubscription(subscription(false, true));
    const dashboardOnly = commercialAccessFromSubscription(subscription(true, false));
    const both = commercialAccessFromSubscription(subscription(true, true));

    expect(allowsDashboardCommercialRequirement("BRANDING", brandOnly)).toBe(false);
    expect(allowsDashboardCommercialRequirement("BRANDING", dashboardOnly)).toBe(false);
    expect(allowsDashboardCommercialRequirement("BRANDING", both)).toBe(true);
  });

  it("separates foundation entry from commercial Dashboard access", () => {
    const routeAccess = {
      foundationEntryAuthorized: true,
      locationMapsAuthorized: false,
      commercial: noDashboardCommercialAccess,
    };

    expect(allowsDashboardRouteAccessRequirement("FOUNDATION_ENTRY", routeAccess)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("LOCATION_MAPS", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("DASHBOARD", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("BRANDING", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("SUBSCRIPTION_READ", routeAccess)).toBe(false);
  });

  it("keeps location Maps authority separate from every commercial entitlement", () => {
    const routeAccess = {
      foundationEntryAuthorized: false,
      locationMapsAuthorized: true,
      commercial: noDashboardCommercialAccess,
    };

    expect(allowsDashboardRouteAccessRequirement("LOCATION_MAPS", routeAccess)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("FOUNDATION_ENTRY", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("DASHBOARD", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("BRANDING", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("SUBSCRIPTION_READ", routeAccess)).toBe(false);
  });

  it("requires dedicated Emergency Tasks authorization without granting commercial access", () => {
    const supervisor = {
      foundationEntryAuthorized: true,
      locationMapsAuthorized: true,
      emergencyTasksAuthorized: true,
      commercial: noDashboardCommercialAccess,
    };
    expect(allowsDashboardRouteAccessRequirement("EMERGENCY_TASKS", supervisor)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("DASHBOARD", supervisor)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("BRANDING", supervisor)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("EMERGENCY_TASKS", {
      ...supervisor, emergencyTasksAuthorized: false,
    })).toBe(false);
  });

  it("allows MD-04 feature authority to remain feature-only for special scopes", () => {
    const routeAccess = {
      commercial: noDashboardCommercialAccess,
      foundationEntryAuthorized: false,
      locationMapsAuthorized: false,
      managementAuditAuthorized: true,
      visitContactsAuthorized: false,
    };

    expect(allowsDashboardRouteAccessRequirement("MANAGEMENT_AUDIT", routeAccess)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("VISIT_CONTACTS", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("FOUNDATION_ENTRY", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("LOCATION_MAPS", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("DASHBOARD", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("SUBSCRIPTION_READ", routeAccess)).toBe(false);
  });

  it("adds MD-04 authority without changing independently proven Foundation access", () => {
    const routeAccess = {
      commercial: {
        dashboardAccess: true,
        basicBranding: false,
        subscriptionRead: true,
      },
      foundationEntryAuthorized: true,
      locationMapsAuthorized: true,
      managementAuditAuthorized: true,
      visitContactsAuthorized: false,
    };

    expect(allowsDashboardRouteAccessRequirement("MANAGEMENT_AUDIT", routeAccess)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("FOUNDATION_ENTRY", routeAccess)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("DASHBOARD", routeAccess)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("LOCATION_MAPS", routeAccess)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("SUBSCRIPTION_READ", routeAccess)).toBe(true);
    expect(allowsDashboardRouteAccessRequirement("BRANDING", routeAccess)).toBe(false);
    expect(allowsDashboardRouteAccessRequirement("VISIT_CONTACTS", routeAccess)).toBe(false);
  });
});
