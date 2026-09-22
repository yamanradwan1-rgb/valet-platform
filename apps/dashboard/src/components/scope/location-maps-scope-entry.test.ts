import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  allowsCompanyAdminAllLocations,
  canSelectCompanyAdminScope,
  canSelectScopeLocation,
  shouldDiscoverSupervisorScopes,
} from "./scope-entry-route-policy";
import { resolveOrganizationSelection } from "./scope-entry-selection";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const activeLocation = {
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Main",
  code: "MAIN",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};
const inactiveLocation = { ...activeLocation, status: "INACTIVE" as const };

function subscription(dashboardAccess: boolean) {
  return {
    planCode: "PRO",
    status: "ACTIVE" as const,
    entitlements: {
      dashboardAccess,
      reportExports: false,
      basicBranding: false,
    },
  };
}

function api(request: ReturnType<typeof vi.fn>): DashboardApiClient {
  return { request } as unknown as DashboardApiClient;
}

describe("LOCATION_MAPS scope entry", () => {
  it("discovers Supervisor scopes only for Foundation or Maps entry", () => {
    expect(shouldDiscoverSupervisorScopes("FOUNDATION_ENTRY")).toBe(true);
    expect(shouldDiscoverSupervisorScopes("LOCATION_MAPS")).toBe(true);
    expect(shouldDiscoverSupervisorScopes("DASHBOARD")).toBe(false);
    expect(shouldDiscoverSupervisorScopes("BRANDING")).toBe(false);
    expect(shouldDiscoverSupervisorScopes("SUBSCRIPTION_READ")).toBe(false);
  });

  it("suppresses All Locations and inactive Company Admin Maps selection", () => {
    expect(allowsCompanyAdminAllLocations("LOCATION_MAPS")).toBe(false);
    expect(allowsCompanyAdminAllLocations("DASHBOARD")).toBe(true);
    expect(canSelectCompanyAdminScope("LOCATION_MAPS", null)).toBe(false);
    expect(canSelectCompanyAdminScope("LOCATION_MAPS", inactiveLocation)).toBe(false);
    expect(canSelectCompanyAdminScope("LOCATION_MAPS", activeLocation)).toBe(true);
    expect(canSelectScopeLocation("COMPANY_ADMIN", "LOCATION_MAPS", inactiveLocation)).toBe(false);
    expect(canSelectScopeLocation("COMPANY_ADMIN", "DASHBOARD", inactiveLocation)).toBe(true);
    expect(canSelectScopeLocation("LOCATION_MANAGER", "LOCATION_MAPS", inactiveLocation)).toBe(false);
  });

  it("requires real D-access before Company Admin Location enumeration", async () => {
    const unavailable = vi.fn().mockResolvedValue({
      organizationId: organization.organizationId,
      subscription: subscription(false),
    });
    await expect(
      resolveOrganizationSelection(
        api(unavailable),
        "COMPANY_ADMIN",
        organization,
        "LOCATION_MAPS",
        new AbortController().signal,
      ),
    ).resolves.toEqual({ kind: "UNAVAILABLE" });
    expect(unavailable).toHaveBeenCalledTimes(1);

    const available = vi.fn()
      .mockResolvedValueOnce({
        organizationId: organization.organizationId,
        subscription: subscription(true),
      })
      .mockResolvedValueOnce({ items: [activeLocation, inactiveLocation], nextCursor: null });
    const result = await resolveOrganizationSelection(
      api(available),
      "COMPANY_ADMIN",
      organization,
      "LOCATION_MAPS",
      new AbortController().signal,
    );
    expect(result).toEqual({
      kind: "LOCATIONS",
      page: { items: [activeLocation, inactiveLocation], nextCursor: null },
    });
    expect(available.mock.calls[0]?.[0]).toContain("/subscription");
    expect(available.mock.calls[1]?.[0]).toContain("/locations");
  });

  it("lets LM enumerate exact grants for Maps without consulting commercial state", async () => {
    const request = vi.fn().mockResolvedValue({
      items: [activeLocation],
      nextCursor: null,
    });
    await expect(
      resolveOrganizationSelection(
        api(request),
        "LOCATION_MANAGER",
        organization,
        "LOCATION_MAPS",
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      kind: "LOCATIONS",
      page: { items: [activeLocation], nextCursor: null },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toContain("/dashboard/organizations/");
    expect(request.mock.calls[0]?.[0]).not.toContain("/subscription");
  });
});

describe("MD-04 Foundation scope entry", () => {
  it("selects LM Visit Contacts at Organization grant-set scope without a Location request", async () => {
    const request = vi.fn();
    await expect(resolveOrganizationSelection(
      api(request),
      "LOCATION_MANAGER",
      organization,
      "VISIT_CONTACTS",
      new AbortController().signal,
    )).resolves.toEqual({
      kind: "SELECT",
      scope: { authority: "LOCATION_MANAGER_GRANT_SET", organization },
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("selects CA Visit Contacts as real All Locations context", async () => {
    const request = vi.fn().mockResolvedValue({
      capabilities: [],
      organization,
      scope: { kind: "ALL_LOCATIONS" },
      selectedLocation: null,
    });
    const result = await resolveOrganizationSelection(
      api(request), "COMPANY_ADMIN", organization, "VISIT_CONTACTS",
      new AbortController().signal,
    );
    expect(result).toMatchObject({
      kind: "SELECT",
      scope: { authority: "COMPANY_ADMIN", context: { scope: { kind: "ALL_LOCATIONS" } } },
    });
    expect(request.mock.calls[0]?.[0]).toContain("/context");
    expect(request.mock.calls[0]?.[0]).not.toContain("/subscription");
  });

  it("allows inactive LM Location selection only for Management Audit", () => {
    expect(canSelectScopeLocation("LOCATION_MANAGER", "MANAGEMENT_AUDIT", inactiveLocation)).toBe(true);
    expect(canSelectScopeLocation("LOCATION_MANAGER", "DASHBOARD", inactiveLocation)).toBe(false);
    expect(canSelectScopeLocation("LOCATION_MANAGER", "LOCATION_MAPS", inactiveLocation)).toBe(false);
    expect(shouldDiscoverSupervisorScopes("MANAGEMENT_AUDIT")).toBe(true);
    expect(shouldDiscoverSupervisorScopes("VISIT_CONTACTS")).toBe(false);
  });

  it("keeps CA Audit Organization and exact-Location selection available", async () => {
    const request = vi.fn().mockResolvedValue({
      items: [activeLocation, inactiveLocation], nextCursor: null,
    });
    await expect(resolveOrganizationSelection(
      api(request), "COMPANY_ADMIN", organization, "MANAGEMENT_AUDIT",
      new AbortController().signal,
    )).resolves.toEqual({
      kind: "LOCATIONS",
      page: { items: [activeLocation, inactiveLocation], nextCursor: null },
    });
    expect(allowsCompanyAdminAllLocations("MANAGEMENT_AUDIT")).toBe(true);
    expect(canSelectCompanyAdminScope("MANAGEMENT_AUDIT", null)).toBe(true);
    expect(canSelectCompanyAdminScope("MANAGEMENT_AUDIT", inactiveLocation)).toBe(true);
  });
});
