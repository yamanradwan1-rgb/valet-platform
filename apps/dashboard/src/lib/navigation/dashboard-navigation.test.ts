import { describe, expect, it } from "vitest";

import { dashboardNavigationRegistrations } from "./dashboard-navigation";
import { firstMainNavigationHref } from "./navigation-landing";
import { noNavigationAuthority } from "./navigation-authority";
import { resolveNavigation } from "./navigation-registry";

describe("production dashboard navigation order", () => {
  it("orders eligible product destinations independently of feature registration order", () => {
    const navigation = resolveNavigation(
      dashboardNavigationRegistrations,
      {
        role: "COMPANY_ADMIN",
        organizationId: "organization-1",
        locationId: "location-1",
      },
      "en",
      {
        ...noNavigationAuthority,
        commercial: {
          basicBranding: true,
          dashboardAccess: true,
          subscriptionRead: true,
        },
        features: {
          MANAGEMENT_AUDIT: "ELIGIBLE",
          VISIT_CONTACTS: "ELIGIBLE",
        },
        foundationEntryEligible: true,
        locationMapsEligible: true,
        managementIntelligenceEligible: true,
      },
    );

    expect(navigation.map((item) => item.id)).toEqual([
      "overview",
      "live-operations",
      "vehicles",
      "tasks",
      "employees-shifts",
      "locations",
      "maps-zones",
      "keys",
      "payments",
      "incidents",
      "visit-contacts",
      "analytics",
      "reports",
      "policies-settings",
      "roles-permissions",
      "integrations",
      "branding",
      "billing-subscription",
      "management-audit",
      "security",
      "help",
    ]);
  });

  it.each([
    ["COMPANY_ADMIN", null, true, "/overview"],
    ["LOCATION_MANAGER", "location-1", true, "/overview"],
    ["SUPERVISOR", "location-1", false, "/maps-zones"],
  ] as const)(
    "lands %s on the first eligible MAIN destination",
    (role, locationId, managementIntelligenceEligible, expectedHref) => {
      const navigation = resolveNavigation(
        dashboardNavigationRegistrations,
        { role, organizationId: "organization-1", locationId },
        "en",
        {
          ...noNavigationAuthority,
          commercial: managementIntelligenceEligible
            ? {
                basicBranding: true,
                dashboardAccess: true,
                subscriptionRead: true,
              }
            : noNavigationAuthority.commercial,
          foundationEntryEligible: true,
          locationMapsEligible: true,
          managementIntelligenceEligible,
        },
      );
      expect(firstMainNavigationHref(navigation)).toBe(expectedHref);
    },
  );

  it("does not register Workspace or the unsupported Validations route", () => {
    const ids = dashboardNavigationRegistrations.map(({ id }) => id);
    expect(ids).not.toContain("workspace");
    expect(ids).not.toContain("validations");
  });
});
