import { describe, expect, it } from "vitest";

import { dashboardNavigationRegistrations } from "./dashboard-navigation";
import { noNavigationAuthority } from "./navigation-authority";
import { resolveNavigation } from "./navigation-registry";

function ids(
  role: "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR",
  locationId: string | null,
  visit: "ELIGIBLE" | "NOT_APPLICABLE" | "DENIED",
  audit: "ELIGIBLE" | "NOT_APPLICABLE" | "DENIED",
) {
  return resolveNavigation(
    dashboardNavigationRegistrations,
    { locationId, organizationId: "organization", role },
    "en",
    {
      ...noNavigationAuthority,
      features: {
        MANAGEMENT_AUDIT: audit,
        VISIT_CONTACTS: visit,
      },
    },
  ).map((item) => item.id);
}

describe("real MD-04 production navigation registrations", () => {
  it("uses the two real destinations and exact feature requirements", () => {
    const md04 = dashboardNavigationRegistrations.filter((item) => item.owner === "MD-04");
    expect(md04.map(({ href, accessRequirement, availability }) => ({
      accessRequirement, availability, href,
    }))).toEqual([
      { accessRequirement: "VISIT_CONTACTS", availability: "IMPLEMENTED", href: "/customers" },
      { accessRequirement: "MANAGEMENT_AUDIT", availability: "IMPLEMENTED", href: "/audit-log" },
    ]);
  });

  it("lets server navigation authority decide independent MD-04 visibility", () => {
    expect(ids("COMPANY_ADMIN", null, "ELIGIBLE", "ELIGIBLE")).toEqual(
      expect.arrayContaining(["visit-contacts", "management-audit"]),
    );
    expect(ids("COMPANY_ADMIN", "location", "NOT_APPLICABLE", "ELIGIBLE"))
      .toContain("management-audit");
    expect(ids("COMPANY_ADMIN", "location", "NOT_APPLICABLE", "ELIGIBLE"))
      .not.toContain("visit-contacts");
    expect(ids("LOCATION_MANAGER", null, "ELIGIBLE", "NOT_APPLICABLE"))
      .toEqual(["visit-contacts"]);
    expect(ids("LOCATION_MANAGER", "location", "NOT_APPLICABLE", "ELIGIBLE"))
      .toContain("management-audit");
    expect(ids("SUPERVISOR", "location", "NOT_APPLICABLE", "ELIGIBLE"))
      .toContain("management-audit");
    expect(ids("SUPERVISOR", "location", "NOT_APPLICABLE", "ELIGIBLE"))
      .not.toContain("visit-contacts");
  });
});
