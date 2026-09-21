import { describe, expect, it } from "vitest";

import { resolveNavigation } from "../../lib/navigation/navigation-registry";
import type { DashboardRouteAccess } from "../../lib/scope/dashboard-commercial-access";
import { md02NavigationRegistrations } from "./administration-navigation";

const fullAccess: DashboardRouteAccess = {
  foundationEntryAuthorized: true,
  commercial: { dashboardAccess: true, basicBranding: true, subscriptionRead: true },
};

function ids(role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR", access = fullAccess) {
  return resolveNavigation(
    md02NavigationRegistrations,
    { role, organizationId: "org", locationId: "location" },
    "en",
    access,
  ).map((item) => item.id);
}

describe("MD-02 navigation authority", () => {
  it("uses the exact route-specific access requirements and never FOUNDATION_ENTRY", () => {
    expect(md02NavigationRegistrations.map(({ href, accessRequirement }) => [href, accessRequirement])).toEqual([
      ["/employees", "DASHBOARD"],
      ["/locations", "DASHBOARD"],
      ["/policies", "DASHBOARD"],
      ["/roles-permissions", "DASHBOARD"],
      ["/branding", "BRANDING"],
      ["/integrations", "DASHBOARD"],
      ["/billing-subscription", "SUBSCRIPTION_READ"],
    ]);
    expect(md02NavigationRegistrations.some((item) => item.accessRequirement === "FOUNDATION_ENTRY")).toBe(false);
  });

  it("exposes the accepted CA and LM surfaces while exposing none to Supervisor", () => {
    expect(ids("COMPANY_ADMIN")).toEqual([
      "employees-shifts", "locations", "policies-settings", "roles-permissions",
      "branding", "integrations", "billing-subscription",
    ]);
    expect(ids("LOCATION_MANAGER")).toEqual([
      "employees-shifts", "locations", "policies-settings", "branding", "billing-subscription",
    ]);
    expect(ids("SUPERVISOR")).toEqual([]);
  });

  it("shows only Billing during authorized no-D subscription recovery", () => {
    const recovery: DashboardRouteAccess = {
      foundationEntryAuthorized: false,
      commercial: { dashboardAccess: false, basicBranding: true, subscriptionRead: true },
    };
    expect(ids("COMPANY_ADMIN", recovery)).toEqual(["billing-subscription"]);
    expect(ids("LOCATION_MANAGER", recovery)).toEqual(["billing-subscription"]);
  });

  it("requires both dashboardAccess and basicBranding for Branding", () => {
    const cases = [
      [{ dashboardAccess: false, basicBranding: true, subscriptionRead: true }, false],
      [{ dashboardAccess: true, basicBranding: false, subscriptionRead: true }, false],
      [{ dashboardAccess: true, basicBranding: true, subscriptionRead: true }, true],
    ] as const;
    for (const [commercial, expected] of cases) {
      expect(ids("COMPANY_ADMIN", { foundationEntryAuthorized: true, commercial }).includes("branding")).toBe(expected);
    }
  });
});
