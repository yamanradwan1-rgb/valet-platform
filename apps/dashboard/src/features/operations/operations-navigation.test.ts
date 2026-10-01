import { describe, expect, it } from "vitest";

import {
  noNavigationAuthority,
  type NavigationAuthority,
} from "../../lib/navigation/navigation-authority";
import { resolveNavigation } from "../../lib/navigation/navigation-registry";
import { md03NavigationRegistrations } from "./operations-navigation";

const fullAccess: NavigationAuthority = {
  ...noNavigationAuthority,
  foundationEntryEligible: true,
  locationMapsEligible: true,
  commercial: { dashboardAccess: true, basicBranding: false, subscriptionRead: true },
};
const mapsOnly: NavigationAuthority = {
  ...noNavigationAuthority,
  foundationEntryEligible: true,
  locationMapsEligible: true,
  commercial: { dashboardAccess: false, basicBranding: false, subscriptionRead: false },
};

function ids(
  role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR",
  access: NavigationAuthority,
  locationId: string | null = "location",
) {
  return resolveNavigation(
    md03NavigationRegistrations,
    { role, organizationId: "organization", locationId },
    "en",
    access,
  ).map((item) => item.id);
}

describe("MD-03 navigation authority", () => {
  it("uses only DASHBOARD business reads and LOCATION_MAPS for Maps", () => {
    expect(md03NavigationRegistrations.map(({ href, accessRequirement }) => [href, accessRequirement])).toEqual([
      ["/live-operations", "DASHBOARD"],
      ["/vehicles", "DASHBOARD"],
      ["/tasks", "DASHBOARD"],
      ["/maps-zones", "LOCATION_MAPS"],
      ["/keys", "DASHBOARD"],
      ["/incidents", "DASHBOARD"],
    ]);
    expect(md03NavigationRegistrations.some((item) => item.accessRequirement === "FOUNDATION_ENTRY")).toBe(false);
  });

  it("shows all exact-Location MD-03 reads to CA/LM with D-access", () => {
    const expected = ["live-operations", "vehicles", "tasks", "maps-zones", "keys", "incidents"];
    expect(ids("COMPANY_ADMIN", fullAccess)).toEqual(expected);
    expect(ids("LOCATION_MANAGER", fullAccess)).toEqual(expected);
  });

  it("names the keys destination consistently in English and Arabic", () => {
    const keys = md03NavigationRegistrations.find((item) => item.id === "keys");
    expect(keys?.labels).toEqual({
      ar: "المفاتيح ومواقف السيارات",
      en: "Keys & Spots",
    });
  });

  it("keeps LM Maps visible without D while hiding all other MD-03 pages", () => {
    const lmNoDashboard: NavigationAuthority = {
      ...mapsOnly,
      commercial: { dashboardAccess: false, basicBranding: true, subscriptionRead: true },
    };
    expect(ids("LOCATION_MANAGER", lmNoDashboard)).toEqual(["maps-zones"]);
  });

  it("gives Supervisor only Maps and requires exact Location scope", () => {
    expect(ids("SUPERVISOR", mapsOnly)).toEqual(["maps-zones"]);
    expect(ids("COMPANY_ADMIN", fullAccess, null)).toEqual([]);
    expect(ids("LOCATION_MANAGER", fullAccess, null)).toEqual([]);
    expect(ids("SUPERVISOR", mapsOnly, null)).toEqual([]);
  });
});
