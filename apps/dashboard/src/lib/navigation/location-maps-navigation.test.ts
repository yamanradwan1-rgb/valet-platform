import { describe, expect, it } from "vitest";
import { Building2, MapPin, Palette, Receipt } from "lucide-react";

import type { DashboardRouteAccess } from "../scope/dashboard-commercial-access";
import {
  composeNavigationRegistry,
  defineNavigationDestination,
  isNavigationPathActive,
  resolveNavigation,
} from "./navigation-registry";

const maps = defineNavigationDestination({
  accessRequirement: "LOCATION_MAPS",
  availability: "IMPLEMENTED",
  href: "/test-location-maps",
  icon: MapPin,
  id: "test-location-maps",
  labels: { ar: "خرائط اختبار", en: "Test Maps" },
  owner: "MD-03",
  placement: "MAIN",
  roles: ["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"],
  scopeRequirement: "LOCATION",
});

const supervisorCommercial = [
  defineNavigationDestination({
    ...maps,
    accessRequirement: "DASHBOARD",
    href: "/test-dashboard",
    icon: Building2,
    id: "test-dashboard",
  }),
  defineNavigationDestination({
    ...maps,
    accessRequirement: "BRANDING",
    href: "/test-branding",
    icon: Palette,
    id: "test-branding",
  }),
  defineNavigationDestination({
    ...maps,
    accessRequirement: "SUBSCRIPTION_READ",
    href: "/test-subscription",
    icon: Receipt,
    id: "test-subscription",
  }),
] as const;

function access(input: {
  readonly dashboardAccess: boolean;
  readonly locationMapsAuthorized: boolean;
  readonly supervisor?: boolean;
}): DashboardRouteAccess {
  return {
    foundationEntryAuthorized: input.supervisor === true,
    locationMapsAuthorized: input.locationMapsAuthorized,
    commercial: input.supervisor === true
      ? { dashboardAccess: false, basicBranding: false, subscriptionRead: false }
      : {
          dashboardAccess: input.dashboardAccess,
          basicBranding: false,
          subscriptionRead: true,
        },
  };
}

function visible(
  role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR",
  routeAccess: DashboardRouteAccess,
  locationId: string | null = "location-1",
) {
  return resolveNavigation(
    [maps],
    { role, organizationId: "organization-1", locationId },
    "en",
    routeAccess,
  ).map((item) => item.id);
}

describe("LOCATION_MAPS navigation policy", () => {
  it("matches Company Admin and Location Manager exact-Location authority", () => {
    expect(visible("COMPANY_ADMIN", access({
      dashboardAccess: true,
      locationMapsAuthorized: true,
    }))).toEqual(["test-location-maps"]);
    expect(visible("COMPANY_ADMIN", access({
      dashboardAccess: false,
      locationMapsAuthorized: false,
    }))).toEqual([]);
    expect(visible(
      "COMPANY_ADMIN",
      access({ dashboardAccess: true, locationMapsAuthorized: true }),
      null,
    )).toEqual([]);

    expect(visible("LOCATION_MANAGER", access({
      dashboardAccess: true,
      locationMapsAuthorized: true,
    }))).toEqual(["test-location-maps"]);
    expect(visible("LOCATION_MANAGER", access({
      dashboardAccess: false,
      locationMapsAuthorized: true,
    }))).toEqual(["test-location-maps"]);
  });

  it("shows only the Maps test destination to Supervisor commercial=false authority", () => {
    const registry = composeNavigationRegistry([maps], supervisorCommercial);
    const items = resolveNavigation(
      registry,
      {
        role: "SUPERVISOR",
        organizationId: "organization-1",
        locationId: "location-1",
      },
      "en",
      access({
        dashboardAccess: false,
        locationMapsAuthorized: true,
        supervisor: true,
      }),
    );

    expect(items.map((item) => item.id)).toEqual(["test-location-maps"]);
    expect(maps.roles).not.toContain("EMPLOYEE");
  });

  it("preserves duplicate destination rejection and nested route matching", () => {
    expect(() => composeNavigationRegistry([maps], [{ ...maps, id: "duplicate-href" }]))
      .toThrow("Duplicate navigation destination href");
    expect(isNavigationPathActive("/test-location-maps/live", "/test-location-maps"))
      .toBe(true);
    expect(isNavigationPathActive("/test-location-maps-old", "/test-location-maps"))
      .toBe(false);
  });
});
