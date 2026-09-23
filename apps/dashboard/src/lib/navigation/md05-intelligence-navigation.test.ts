import { ChartNoAxesCombined } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../api/dashboard-api-client";
import { resolveNavigationAuthority } from "../../components/foundation/resolve-navigation-authority";
import type { SelectedDashboardScope } from "../../components/scope";
import { resolveNavigation } from "./navigation-registry";
import type { DashboardNavigationRegistration } from "./navigation-types";

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
const registration: DashboardNavigationRegistration = {
  accessRequirement: "MANAGEMENT_INTELLIGENCE",
  availability: "IMPLEMENTED",
  href: "/test-intelligence",
  icon: ChartNoAxesCombined,
  id: "test-intelligence",
  labels: { ar: "التحليلات", en: "Intelligence" },
  owner: "MD-05",
  placement: "MAIN",
  roles: ["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"],
  scopeRequirement: "ORGANIZATION",
};

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
  const selectedLocation = kind === "LOCATION"
    ? { ...activeLocation, status }
    : null;
  return {
    authority: "COMPANY_ADMIN",
    context: {
      capabilities: [],
      organization,
      scope: kind === "LOCATION"
        ? { kind: "LOCATION", locationId: activeLocation.locationId }
        : { kind: "ALL_LOCATIONS" },
      selectedLocation,
    },
  };
}

function companyRequest(dashboardAccess: boolean, status: "ACTIVE" | "INACTIVE") {
  return vi.fn(async (path: string, _schema: unknown, options?: {
    readonly query?: { readonly scopeKind?: "ALL_LOCATIONS" | "LOCATION" };
  }) => {
    if (path === "/v1/staff/dashboard/feature-authority") {
      throw new Error("MANAGEMENT_INTELLIGENCE must not use feature-authority.");
    }
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

function visible(
  scope: SelectedDashboardScope,
  authority: Awaited<ReturnType<typeof resolveNavigationAuthority>>,
) {
  const role = scope.authority === "COMPANY_ADMIN" ||
    scope.authority === "COMPANY_ADMIN_SUBSCRIPTION"
    ? "COMPANY_ADMIN"
    : scope.authority === "SUPERVISOR"
      ? "SUPERVISOR"
      : "LOCATION_MANAGER";
  const locationId = scope.authority === "COMPANY_ADMIN"
    ? scope.context.selectedLocation?.locationId ?? null
    : scope.authority === "LOCATION_MANAGER"
      ? scope.location.locationId
      : scope.authority === "SUPERVISOR"
        ? scope.context.location.locationId
        : null;
  return resolveNavigation(
    [registration],
    { role, organizationId: organization.organizationId, locationId },
    "en",
    authority,
  ).map((item) => item.id);
}

describe("MD-05 intelligence navigation authority", () => {
  it.each([
    ["ALL_LOCATIONS", "ACTIVE"],
    ["LOCATION", "ACTIVE"],
  ] as const)("shows CA %s without a feature-authority probe", async (kind, status) => {
    const scope = companyScope(kind, status);
    const request = companyRequest(true, status);
    const authority = await resolveNavigationAuthority({
      api: client(request),
      registrations: [registration],
      selectedScope: scope,
    });
    expect(authority.managementIntelligenceEligible).toBe(true);
    expect(visible(scope, authority)).toEqual(["test-intelligence"]);
    expect(request.mock.calls.some(
      ([path]) => path === "/v1/staff/dashboard/feature-authority",
    )).toBe(false);
  });

  it("hides inactive or non-D-authorized CA scopes", async () => {
    const inactiveScope = companyScope("LOCATION", "INACTIVE");
    const inactiveRequest = companyRequest(true, "INACTIVE");
    const inactive = await resolveNavigationAuthority({
      api: client(inactiveRequest),
      registrations: [registration],
      selectedScope: inactiveScope,
    });
    expect(inactive.managementIntelligenceEligible).toBe(false);
    expect(visible(inactiveScope, inactive)).toEqual([]);

    const noDashboardScope = companyScope("ALL_LOCATIONS");
    const noDashboardRequest = companyRequest(false, "ACTIVE");
    const noDashboard = await resolveNavigationAuthority({
      api: client(noDashboardRequest),
      registrations: [registration],
      selectedScope: noDashboardScope,
    });
    expect(noDashboard.managementIntelligenceEligible).toBe(false);
    expect(visible(noDashboardScope, noDashboard)).toEqual([]);
    expect(noDashboardRequest).toHaveBeenCalledTimes(1);
  });

  it("shows only active D-authorized LM exact Location", async () => {
    const activeScope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location: activeLocation,
    };
    const allowedRequest = vi.fn(async (path: string) => {
      if (path === "/v1/staff/dashboard/feature-authority") {
        throw new Error("Unexpected feature-authority probe.");
      }
      if (path.endsWith("/subscription")) {
        return {
          locationId: activeLocation.locationId,
          organizationId: organization.organizationId,
          subscription: subscription(true),
        };
      }
      throw new Error(path);
    });
    const allowed = await resolveNavigationAuthority({
      api: client(allowedRequest),
      registrations: [registration],
      selectedScope: activeScope,
    });
    expect(allowed.managementIntelligenceEligible).toBe(true);
    expect(visible(activeScope, allowed)).toEqual(["test-intelligence"]);

    const noDashboardRequest = vi.fn().mockResolvedValue({
      locationId: activeLocation.locationId,
      organizationId: organization.organizationId,
      subscription: subscription(false),
    });
    const noDashboard = await resolveNavigationAuthority({
      api: client(noDashboardRequest),
      registrations: [registration],
      selectedScope: activeScope,
    });
    expect(noDashboard.managementIntelligenceEligible).toBe(false);

    const inactiveScope = { ...activeScope, location: { ...activeLocation, status: "INACTIVE" as const } };
    const inactiveRequest = vi.fn();
    const inactive = await resolveNavigationAuthority({
      api: client(inactiveRequest),
      registrations: [registration],
      selectedScope: inactiveScope,
    });
    expect(inactive.managementIntelligenceEligible).toBe(false);
    expect(inactiveRequest).not.toHaveBeenCalled();
  });

  it("keeps grant-set and subscription-only scopes ineligible", async () => {
    for (const scope of [
      { authority: "LOCATION_MANAGER_GRANT_SET", organization },
      { authority: "COMPANY_ADMIN_SUBSCRIPTION", organization },
    ] satisfies readonly SelectedDashboardScope[]) {
      const request = vi.fn(async (path: string) => {
        if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION" && path.endsWith("/subscription")) {
          return {
            organizationId: organization.organizationId,
            subscription: subscription(true),
          };
        }
        throw new Error(path);
      });
      const authority = await resolveNavigationAuthority({
        api: client(request),
        registrations: [registration],
        selectedScope: scope,
      });
      expect(authority.managementIntelligenceEligible).toBe(false);
      expect(visible(scope, authority)).toEqual([]);
      expect(request.mock.calls.some(
        ([path]) => path === "/v1/staff/dashboard/feature-authority",
      )).toBe(false);
    }
  });
});
