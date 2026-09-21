import { describe, expect, it } from "vitest";
import { Building2, FileText, MapPin } from "lucide-react";

import {
  composeNavigationRegistry,
  defineNavigationDestination,
  resolveNavigation,
} from "./navigation-registry";

const base = {
  availability: "IMPLEMENTED" as const,
  labels: { ar: "اختبار", en: "Test" },
  owner: "MD-02" as const,
  placement: "MAIN" as const,
  roles: ["COMPANY_ADMIN"] as const,
  scopeRequirement: "ORGANIZATION" as const,
};

describe("navigation commercial access", () => {
  it("exposes only subscription-compatible destinations during recovery", () => {
    const registry = composeNavigationRegistry([
      defineNavigationDestination({
        ...base,
        commercialRequirement: "DASHBOARD",
        href: "/normal",
        icon: Building2,
        id: "normal",
      }),
      defineNavigationDestination({
        ...base,
        commercialRequirement: "BRANDING",
        href: "/branding",
        icon: MapPin,
        id: "branding",
      }),
      defineNavigationDestination({
        ...base,
        commercialRequirement: "SUBSCRIPTION_READ",
        href: "/billing-subscription",
        icon: FileText,
        id: "subscription",
      }),
    ]);
    const items = resolveNavigation(
      registry,
      {
        role: "COMPANY_ADMIN",
        organizationId: "organization-1",
        locationId: null,
      },
      "en",
      {
        dashboardAccess: false,
        basicBranding: true,
        subscriptionRead: true,
      },
    );

    expect(items.map((item) => item.id)).toEqual(["subscription"]);
  });
});
