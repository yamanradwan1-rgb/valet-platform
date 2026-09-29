import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { allowsDashboardRouteAccessRequirement } from "../../lib/scope/dashboard-commercial-access";
import {
  allowsCompanyAdminAllLocations,
  canSelectCompanyAdminScope,
  canSelectScopeLocation,
  shouldDiscoverSupervisorScopes,
} from "../scope/scope-entry-route-policy";
import { resolveOrganizationSelection } from "../scope/scope-entry-selection";
import type { SelectedDashboardScope } from "../scope";
import { revalidateSelectedScope } from "./revalidate-selected-scope";

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
const membershipId = "33333333-3333-4333-8333-333333333333";
const shiftId = "44444444-4444-4444-8444-444444444444";

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

function client(request: ReturnType<typeof vi.fn>): DashboardApiClient {
  return { request } as unknown as DashboardApiClient;
}

function companyScope(
  kind: "ALL_LOCATIONS" | "LOCATION",
  status: "ACTIVE" | "INACTIVE" = "ACTIVE",
): SelectedDashboardScope {
  const location = { ...activeLocation, status };
  return {
    authority: "COMPANY_ADMIN",
    context: {
      capabilities: [],
      organization,
      scope: kind === "ALL_LOCATIONS"
        ? { kind: "ALL_LOCATIONS" }
        : { kind: "LOCATION", locationId: location.locationId },
      selectedLocation: kind === "LOCATION" ? location : null,
    },
  };
}

function companyRequest(dashboardAccess: boolean, status: "ACTIVE" | "INACTIVE") {
  return vi.fn(async (path: string, _schema: unknown, options?: {
    readonly query?: { readonly scopeKind?: "ALL_LOCATIONS" | "LOCATION" };
  }) => {
    if (path.endsWith("/subscription")) {
      return {
        organizationId: organization.organizationId,
        subscription: subscription(dashboardAccess),
      };
    }
    if (path.endsWith("/context")) {
      const exact = options?.query?.scopeKind === "LOCATION";
      return {
        capabilities: [],
        organization,
        scope: exact
          ? { kind: "LOCATION", locationId: activeLocation.locationId }
          : { kind: "ALL_LOCATIONS" },
        selectedLocation: exact ? { ...activeLocation, status } : null,
      };
    }
    throw new Error(`Unexpected path ${path}`);
  });
}

describe("MD-05 intelligence authority", () => {
  it("keeps scope entry to CA All Locations or active exact Locations only", () => {
    expect(shouldDiscoverSupervisorScopes("MANAGEMENT_INTELLIGENCE")).toBe(false);
    expect(allowsCompanyAdminAllLocations("MANAGEMENT_INTELLIGENCE")).toBe(true);
    expect(canSelectCompanyAdminScope("MANAGEMENT_INTELLIGENCE", null)).toBe(true);
    expect(canSelectCompanyAdminScope("MANAGEMENT_INTELLIGENCE", activeLocation)).toBe(true);
    expect(canSelectCompanyAdminScope("MANAGEMENT_INTELLIGENCE", inactiveLocation)).toBe(false);
    expect(canSelectScopeLocation(
      "COMPANY_ADMIN", "MANAGEMENT_INTELLIGENCE", inactiveLocation,
    )).toBe(false);
    expect(canSelectScopeLocation(
      "LOCATION_MANAGER", "MANAGEMENT_INTELLIGENCE", activeLocation,
    )).toBe(true);
    expect(canSelectScopeLocation(
      "LOCATION_MANAGER", "MANAGEMENT_INTELLIGENCE", inactiveLocation,
    )).toBe(false);
  });

  it("D-gates CA organization selection before enumerating Locations", async () => {
    const unavailable = vi.fn().mockResolvedValue({
      organizationId: organization.organizationId,
      subscription: subscription(false),
    });
    await expect(resolveOrganizationSelection(
      client(unavailable),
      "COMPANY_ADMIN",
      organization,
      "MANAGEMENT_INTELLIGENCE",
      new AbortController().signal,
    )).resolves.toEqual({ kind: "UNAVAILABLE" });
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(String(unavailable.mock.calls[0]?.[0])).toContain("/subscription");

    const available = vi.fn()
      .mockResolvedValueOnce({
        organizationId: organization.organizationId,
        subscription: subscription(true),
      })
      .mockResolvedValueOnce({ items: [activeLocation, inactiveLocation], nextCursor: null });
    await expect(resolveOrganizationSelection(
      client(available),
      "COMPANY_ADMIN",
      organization,
      "MANAGEMENT_INTELLIGENCE",
      new AbortController().signal,
    )).resolves.toEqual({
      kind: "LOCATIONS",
      page: { items: [activeLocation, inactiveLocation], nextCursor: null },
    });
    expect(String(available.mock.calls[0]?.[0])).toContain("/subscription");
    expect(String(available.mock.calls[1]?.[0])).toContain("/locations");
  });

  it.each([
    ["ALL_LOCATIONS", "ACTIVE", false],
    ["LOCATION", "ACTIVE", true],
  ] as const)("authorizes CA %s from current Management facts", async (kind, status, maps) => {
    const request = companyRequest(true, status);
    const result = await revalidateSelectedScope(
      client(request),
      companyScope(kind, status),
      "MANAGEMENT_INTELLIGENCE",
    );
    expect(result.status).toBe("valid");
    expect(result.routeAccess).toMatchObject({
      foundationEntryAuthorized: true,
      locationMapsAuthorized: maps,
      managementIntelligenceAuthorized: true,
    });
    expect(allowsDashboardRouteAccessRequirement(
      "MANAGEMENT_INTELLIGENCE",
      result.routeAccess!,
    )).toBe(true);
    expect(request.mock.calls.some(
      ([path]) => path === "/v1/staff/dashboard/feature-authority",
    )).toBe(false);
  });

  it("fails closed for inactive CA exact Location and missing CA D-access", async () => {
    await expect(revalidateSelectedScope(
      client(companyRequest(true, "INACTIVE")),
      companyScope("LOCATION", "INACTIVE"),
      "MANAGEMENT_INTELLIGENCE",
    )).resolves.toEqual({ status: "denied", routeAccess: null });

    const noDashboard = companyRequest(false, "ACTIVE");
    await expect(revalidateSelectedScope(
      client(noDashboard),
      companyScope("ALL_LOCATIONS"),
      "MANAGEMENT_INTELLIGENCE",
    )).resolves.toEqual({ status: "entitlement", routeAccess: null });
    expect(noDashboard).toHaveBeenCalledTimes(1);
  });

  it("allows only active D-authorized LM exact Location", async () => {
    const activeScope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location: activeLocation,
    };
    const allowed = vi.fn().mockResolvedValue({
      locationId: activeLocation.locationId,
      organizationId: organization.organizationId,
      subscription: subscription(true),
    });
    const result = await revalidateSelectedScope(
      client(allowed),
      activeScope,
      "MANAGEMENT_INTELLIGENCE",
    );
    expect(result).toMatchObject({
      status: "valid",
      routeAccess: { managementIntelligenceAuthorized: true },
    });

    const noDashboard = vi.fn().mockResolvedValue({
      locationId: activeLocation.locationId,
      organizationId: organization.organizationId,
      subscription: subscription(false),
    });
    await expect(revalidateSelectedScope(
      client(noDashboard),
      activeScope,
      "MANAGEMENT_INTELLIGENCE",
    )).resolves.toEqual({ status: "entitlement", routeAccess: null });

    const inactiveRequest = vi.fn();
    await expect(revalidateSelectedScope(
      client(inactiveRequest),
      { ...activeScope, location: inactiveLocation },
      "MANAGEMENT_INTELLIGENCE",
    )).resolves.toEqual({ status: "denied", routeAccess: null });
    expect(inactiveRequest).not.toHaveBeenCalled();
  });

  it("denies grant-set, subscription-only and Supervisor scopes", async () => {
    const noRequest = vi.fn();
    await expect(revalidateSelectedScope(
      client(noRequest),
      { authority: "LOCATION_MANAGER_GRANT_SET", organization },
      "MANAGEMENT_INTELLIGENCE",
    )).resolves.toEqual({ status: "denied", routeAccess: null });
    await expect(revalidateSelectedScope(
      client(noRequest),
      { authority: "COMPANY_ADMIN_SUBSCRIPTION", organization },
      "MANAGEMENT_INTELLIGENCE",
    )).resolves.toEqual({ status: "denied", routeAccess: null });
    expect(noRequest).not.toHaveBeenCalled();

    const supervisor: Extract<SelectedDashboardScope, { authority: "SUPERVISOR" }> = {
      authority: "SUPERVISOR",
      context: {
        authority: "SUPERVISOR",
        membershipId,
        organization: { organizationId: organization.organizationId, name: organization.name },
        location: {
          locationId: activeLocation.locationId,
          name: activeLocation.name,
          code: activeLocation.code,
          currency: activeLocation.currency,
          timezone: activeLocation.timezone,
        },
        activeShift: {
          locationId: activeLocation.locationId,
          shiftId,
          startedAt: "2026-09-23T08:00:00Z",
          status: "ACTIVE",
        },
      },
    };
    const supervisorRequest = vi.fn().mockResolvedValue({
      contexts: [{
        activeShift: supervisor.context.activeShift,
        eligibleLocations: [supervisor.context.location],
        membershipId,
        organization: supervisor.context.organization,
        role: "VALET_SUPERVISOR",
      }],
    });
    await expect(revalidateSelectedScope(
      client(supervisorRequest),
      supervisor,
      "MANAGEMENT_INTELLIGENCE",
    )).resolves.toEqual({ status: "denied", routeAccess: null });
    expect(supervisorRequest).toHaveBeenCalledTimes(1);
  });
});
