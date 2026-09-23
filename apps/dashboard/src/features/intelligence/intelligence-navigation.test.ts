import { describe, expect, it } from "vitest";

import { intelligenceNavigationRegistrations } from "./intelligence-navigation";

describe("MD-05 navigation registrations", () => {
  it("registers exactly four ordered Management Intelligence routes for CA and LM", () => {
    expect(intelligenceNavigationRegistrations.map((item) => ({
      accessRequirement: item.accessRequirement,
      href: item.href,
      id: item.id,
      labels: item.labels,
      roles: item.roles,
    }))).toEqual([
      {
        accessRequirement: "MANAGEMENT_INTELLIGENCE",
        href: "/overview",
        id: "overview",
        labels: { ar: "نظرة عامة", en: "Overview" },
        roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
      },
      {
        accessRequirement: "MANAGEMENT_INTELLIGENCE",
        href: "/payments",
        id: "payments",
        labels: { ar: "المدفوعات", en: "Payments" },
        roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
      },
      {
        accessRequirement: "MANAGEMENT_INTELLIGENCE",
        href: "/analytics",
        id: "analytics",
        labels: { ar: "التحليلات", en: "Analytics" },
        roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
      },
      {
        accessRequirement: "MANAGEMENT_INTELLIGENCE",
        href: "/reports",
        id: "reports",
        labels: { ar: "التقارير", en: "Reports" },
        roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
      },
    ]);
    expect(intelligenceNavigationRegistrations.some((item) => item.href === "/validations"))
      .toBe(false);
  });

  it("keeps the final MD-05 registration metadata fixed without an export gate", () => {
    for (const item of intelligenceNavigationRegistrations) {
      expect(item.owner).toBe("MD-05");
      expect(item.availability).toBe("IMPLEMENTED");
      expect(item.placement).toBe("MAIN");
      expect(item.scopeRequirement).toBe("ORGANIZATION");
    }
  });
});
