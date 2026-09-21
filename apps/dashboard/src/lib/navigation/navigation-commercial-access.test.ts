import { describe, expect, it } from "vitest";
import { Building2, FileText, MapPin } from "lucide-react";

import { md01NavigationRegistrations } from "./md01-navigation";
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
        accessRequirement: "DASHBOARD",
        href: "/normal",
        icon: Building2,
        id: "normal",
      }),
      defineNavigationDestination({
        ...base,
        accessRequirement: "BRANDING",
        href: "/branding",
        icon: MapPin,
        id: "branding",
      }),
      defineNavigationDestination({
        ...base,
        accessRequirement: "SUBSCRIPTION_READ",
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
        foundationEntryAuthorized: false,
        commercial: {
          dashboardAccess: false,
          basicBranding: true,
          subscriptionRead: true,
        },
      },
    );

    expect(items.map((item) => item.id)).toEqual(["subscription"]);
  });

  it("keeps Supervisor foundation navigation without exposing commercial features", () => {
    const supervisorBase = {
      ...base,
      roles: ["SUPERVISOR"] as const,
      scopeRequirement: "LOCATION" as const,
    };
    const registry = composeNavigationRegistry(
      md01NavigationRegistrations,
      [
        defineNavigationDestination({
          ...supervisorBase,
          accessRequirement: "DASHBOARD",
          href: "/supervisor-dashboard-feature",
          icon: Building2,
          id: "supervisor-dashboard-feature",
        }),
        defineNavigationDestination({
          ...supervisorBase,
          accessRequirement: "BRANDING",
          href: "/supervisor-branding-feature",
          icon: MapPin,
          id: "supervisor-branding-feature",
        }),
        defineNavigationDestination({
          ...supervisorBase,
          accessRequirement: "SUBSCRIPTION_READ",
          href: "/supervisor-subscription-feature",
          icon: FileText,
          id: "supervisor-subscription-feature",
        }),
      ],
    );
    const items = resolveNavigation(
      registry,
      {
        role: "SUPERVISOR",
        organizationId: "organization-1",
        locationId: "location-1",
      },
      "en",
      {
        foundationEntryAuthorized: true,
        commercial: {
          dashboardAccess: false,
          basicBranding: false,
          subscriptionRead: false,
        },
      },
    );

    expect(items.map((item) => item.id)).toEqual([
      "workspace",
      "security",
      "help",
    ]);
  });
});
