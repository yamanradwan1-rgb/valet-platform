import { describe, expect, it } from "vitest";

import { md01NavigationRegistrations } from "./md01-navigation";
import {
  composeNavigationRegistry,
  defineNavigationDestination,
  resolveNavigation,
} from "./navigation-registry";
import type {
  DashboardNavigationContext,
  DashboardNavigationRegistration,
  DashboardNavigationRole,
} from "./navigation-types";

const translate = (key: string) => key;

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
    id: "company-administration",
    labelKey: "companyAdministration",
    owner: "MD-02",
    roles: ["COMPANY_ADMIN"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    availability: "IMPLEMENTED",
    href: "/analytics",
    id: "analytics",
    labelKey: "analytics",
    owner: "MD-04",
    roles: ["COMPANY_ADMIN", "LOCATION_MANAGER"],
    scopeRequirement: "ORGANIZATION",
  }),
  defineNavigationDestination({
    availability: "IMPLEMENTED",
    href: "/reports",
    id: "reports",
    labelKey: "reports",
    owner: "MD-04",
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
        translate,
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
      translate,
    );
    const locationManagerItems = resolveNavigation(
      registry,
      context("LOCATION_MANAGER"),
      translate,
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
      translate,
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
      translate,
    ).map((item) => item.id);

    expect(ids).not.toContain("company-administration");
    expect(ids).not.toContain("reports");
  });

  it("keeps future owner metadata hidden until the destination is implemented", () => {
    const planned = defineNavigationDestination({
      availability: "PLANNED",
      href: "/future",
      id: "future-owner-page",
      labelKey: "future",
      owner: "MD-05",
      roles: ["COMPANY_ADMIN"],
      scopeRequirement: "ORGANIZATION",
    });
    const registry = composeNavigationRegistry(md01NavigationRegistrations, [
      planned,
    ]);

    expect(
      resolveNavigation(registry, context("COMPANY_ADMIN"), translate),
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
      id: "location-only",
      labelKey: "locationOnly",
      owner: "MD-03",
      roles: ["LOCATION_MANAGER"],
      scopeRequirement: "LOCATION",
    });

    expect(
      resolveNavigation(
        [scoped],
        context("LOCATION_MANAGER", { locationId: null }),
        translate,
      ),
    ).toEqual([]);
    expect(
      resolveNavigation([scoped], context("LOCATION_MANAGER"), translate),
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
});
