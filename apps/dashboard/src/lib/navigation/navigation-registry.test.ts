import { describe, expect, it } from "vitest";
import { BarChart3, Building2, FileText, MapPin } from "lucide-react";

import { md01NavigationRegistrations } from "./md01-navigation";
import {
  composeNavigationRegistry,
  defineNavigationDestination,
  isNavigationPathActive,
  resolveNavigation,
} from "./navigation-registry";
import type {
  DashboardNavigationContext,
  DashboardNavigationRegistration,
  DashboardNavigationRole,
} from "./navigation-types";

function context(
  role: DashboardNavigationRole,
  overrides: Partial<DashboardNavigationContext> = {},
): DashboardNavigationContext {
  return {
    locationId: "location-1",
    organizationId: "organization-1",
    role,
    ...overrides,
  };
}

const futureRegistrations = [
  defineNavigationDestination({
    availability: "IMPLEMENTED",
    href: "/company/settings",
    icon: Building2,
    id: "company-administration",
    labels: { ar: "إدارة الشركة", en: "Company administration" },
    owner: "MD-02",
    placement: "MAIN",
    roles: ["COMPANY_ADMIN"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    availability: "IMPLEMENTED",
    href: "/analytics",
    icon: BarChart3,
    id: "analytics",
    labels: { ar: "التحليلات", en: "Analytics" },
    owner: "MD-04",
    placement: "MAIN",
    roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    availability: "IMPLEMENTED",
    href: "/reports",
    icon: FileText,
    id: "reports",
    labels: { ar: "التقارير", en: "Reports" },
    owner: "MD-04",
    placement: "MAIN",
    roles: ["COMPANY_ADMIN"],
    scopeRequirement: "ORGANIZATION",
  }),
] satisfies readonly DashboardNavigationRegistration[];

describe("dashboard navigation registry", () => {
  it.each(["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"] as const)(
    "renders only MD-01 destinations for %s before feature registrations are added",
    (role) => {
      const items = resolveNavigation(
        md01NavigationRegistrations,
        context(role),
        "en",
      );
      expect(items.map((item) => item.id)).toEqual([
        "workspace",
        "security",
        "help",
      ]);
      expect(items.every((item) => item.owner === "MD-01")).toBe(true);
    },
  );

  it("uses the exact selected role instead of flattening a user to a highest role", () => {
    const registry = composeNavigationRegistry(
      md01NavigationRegistrations,
      futureRegistrations,
    );

    const companyItems = resolveNavigation(
      registry,
      context("COMPANY_ADMIN"),
      "en",
    );
    const locationManagerItems = resolveNavigation(
      registry,
      context("LOCATION_MANAGER"),
      "en",
    );

    expect(companyItems.map((item) => item.id)).toContain(
      "company-administration",
    );
    expect(locationManagerItems.map((item) => item.id)).not.toContain(
      "company-administration",
    );
    expect(locationManagerItems.map((item) => item.id)).toContain("analytics");
  });

  it("does not expose Company administration, analytics, or reports to Supervisor", () => {
    const registry = composeNavigationRegistry(
      md01NavigationRegistrations,
      futureRegistrations,
    );
    const ids = resolveNavigation(
      registry,
      context("SUPERVISOR"),
      "en",
    ).map((item) => item.id);

    expect(ids).not.toContain("company-administration");
    expect(ids).not.toContain("analytics");
    expect(ids).not.toContain("reports");
  });

  it("does not expose Company Admin-only destinations to Location Manager", () => {
    const registry = composeNavigationRegistry(
      md01NavigationRegistrations,
      futureRegistrations,
    );
    const ids = resolveNavigation(
      registry,
      context("LOCATION_MANAGER"),
      "en",
    ).map((item) => item.id);

    expect(ids).not.toContain("company-administration");
    expect(ids).not.toContain("reports");
  });

  it("keeps future owner metadata hidden until the destination is implemented", () => {
    const planned = defineNavigationDestination({
      availability: "PLANNED",
      href: "/future",
      icon: MapPin,
      id: "future-owner-page",
      labels: { ar: "مستقبلي", en: "Future" },
      owner: "MD-05",
      placement: "MAIN",
      roles: ["COMPANY_ADMIN"],
      scopeRequirement: "ORGANIZATION",
    });
    const registry = composeNavigationRegistry(md01NavigationRegistrations, [
      planned,
    ]);

    expect(
      resolveNavigation(registry, context("COMPANY_ADMIN"), "en"),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "future-owner-page" }),
      ]),
    );
  });

  it("enforces required organization and Location scope before rendering", () => {
    const scoped = defineNavigationDestination({
      availability: "IMPLEMENTED",
      href: "/location-only",
      icon: MapPin,
      id: "location-only",
      labels: { ar: "موقع فقط", en: "Location only" },
      owner: "MD-03",
      placement: "MAIN",
      roles: ["LOCATION_MANAGER"],
      scopeRequirement: "LOCATION",
    });

    expect(
      resolveNavigation(
        [scoped],
        context("LOCATION_MANAGER", { locationId: null }),
        "en",
      ),
    ).toEqual([]);
    expect(
      resolveNavigation([scoped], context("LOCATION_MANAGER"), "en"),
    ).toHaveLength(1);
  });

  it("rejects duplicate destination ids and hrefs across owner registrations", () => {
    const duplicateId = { ...futureRegistrations[0]!, href: "/other" };
    const duplicateHref = { ...futureRegistrations[0]!, id: "other" };

    expect(() =>
      composeNavigationRegistry(futureRegistrations, [duplicateId]),
    ).toThrow("Duplicate navigation destination id");
    expect(() =>
      composeNavigationRegistry(futureRegistrations, [duplicateHref]),
    ).toThrow("Duplicate navigation destination href");
  });

  it("keeps feature-owned labels localizable without shared dictionary edits", () => {
    const registry = composeNavigationRegistry(
      md01NavigationRegistrations,
      futureRegistrations,
    );
    const arabic = resolveNavigation(
      registry,
      context("COMPANY_ADMIN"),
      "ar",
    );

    expect(arabic.find((item) => item.id === "analytics")?.label).toBe(
      "التحليلات",
    );
  });

  it("keeps nested feature routes active without treating root as a prefix", () => {
    expect(isNavigationPathActive("/analytics/live", "/analytics")).toBe(true);
    expect(isNavigationPathActive("/analytics-old", "/analytics")).toBe(false);
    expect(isNavigationPathActive("/help", "/")).toBe(false);
    expect(isNavigationPathActive("/", "/")).toBe(true);
  });
});
