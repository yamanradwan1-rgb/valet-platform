import { CircleHelp, Map } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { DashboardNavigationRegistration } from "../../lib/navigation/navigation-types";
import type { SelectedDashboardScope } from "../scope";
import { resolveNavigationAuthority } from "./resolve-navigation-authority";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const location = {
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Main",
  code: "MAIN",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};
const membershipId = "33333333-3333-4333-8333-333333333333";
const shiftId = "44444444-4444-4444-8444-444444444444";

const visitRegistration = registration(
  "visit",
  "VISIT_CONTACTS",
  ["COMPANY_ADMIN", "LOCATION_MANAGER"],
);
const auditRegistration = registration(
  "audit",
  "MANAGEMENT_AUDIT",
  ["COMPANY_ADMIN", "LOCATION_MANAGER", "SUPERVISOR"],
);
const mapsRegistration: DashboardNavigationRegistration = {
  accessRequirement: "LOCATION_MAPS",
  availability: "IMPLEMENTED",
  href: "/maps",
  icon: Map,
  id: "maps",
  labels: { ar: "خرائط", en: "Maps" },
  owner: "MD-03",
  placement: "MAIN",
  roles: ["SUPERVISOR"],
  scopeRequirement: "LOCATION",
};

function registration(
  id: string,
  accessRequirement: "VISIT_CONTACTS" | "MANAGEMENT_AUDIT",
  roles: DashboardNavigationRegistration["roles"],
): DashboardNavigationRegistration {
  return {
    accessRequirement,
    availability: "IMPLEMENTED",
    href: `/${id}`,
    icon: CircleHelp,
    id,
    labels: { ar: id, en: id },
    owner: "MD-04",
    placement: "MAIN",
    roles,
    scopeRequirement: "ORGANIZATION",
  };
}

function client(request: ReturnType<typeof vi.fn>): DashboardApiClient {
  return { request } as unknown as DashboardApiClient;
}

describe("navigation authority special scopes", () => {
  it("keeps LM grant-set Visit Contacts feature-only", async () => {
    const scope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER_GRANT_SET",
      organization,
    };
    const request = vi.fn().mockResolvedValue({
      feature: "VISIT_CONTACTS",
      organizationId: organization.organizationId,
      role: "LOCATION_MANAGER",
      scope: { kind: "ORGANIZATION_GRANT_SET" },
    });
    const authority = await resolveNavigationAuthority({
      api: client(request),
      registrations: [visitRegistration, auditRegistration],
      selectedScope: scope,
    });
    expect(authority).toMatchObject({
      commercial: { dashboardAccess: false, basicBranding: false, subscriptionRead: false },
      foundationEntryEligible: false,
      locationMapsEligible: false,
      features: { VISIT_CONTACTS: "ELIGIBLE", MANAGEMENT_AUDIT: "NOT_APPLICABLE" },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps inactive granted LM Audit feature-only", async () => {
    const scope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location: { ...location, status: "INACTIVE" },
    };
    const request = vi.fn().mockResolvedValue({
      feature: "MANAGEMENT_AUDIT",
      organizationId: organization.organizationId,
      role: "LOCATION_MANAGER",
      scope: { kind: "LOCATION", locationId: location.locationId },
    });
    const authority = await resolveNavigationAuthority({
      api: client(request),
      registrations: [visitRegistration, auditRegistration],
      selectedScope: scope,
    });
    expect(authority).toMatchObject({
      commercial: { dashboardAccess: false },
      foundationEntryEligible: false,
      locationMapsEligible: false,
      features: { VISIT_CONTACTS: "NOT_APPLICABLE", MANAGEMENT_AUDIT: "ELIGIBLE" },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps active LM base and adds only exact-Location Audit", async () => {
    const scope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location,
    };
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/subscription")) {
        return {
          locationId: location.locationId,
          organizationId: organization.organizationId,
          subscription: {
            planCode: "PRO",
            status: "ACTIVE",
            entitlements: {
              basicBranding: true,
              dashboardAccess: true,
              reportExports: false,
            },
          },
        };
      }
      if (path === "/v1/staff/dashboard/feature-authority") {
        return {
          feature: "MANAGEMENT_AUDIT",
          organizationId: organization.organizationId,
          role: "LOCATION_MANAGER",
          scope: { kind: "LOCATION", locationId: location.locationId },
        };
      }
      throw new Error(path);
    });
    const authority = await resolveNavigationAuthority({
      api: client(request),
      registrations: [visitRegistration, auditRegistration],
      selectedScope: scope,
    });
    expect(authority).toMatchObject({
      commercial: { dashboardAccess: true },
      foundationEntryEligible: true,
      locationMapsEligible: true,
      features: { VISIT_CONTACTS: "NOT_APPLICABLE", MANAGEMENT_AUDIT: "ELIGIBLE" },
    });
  });

  it("preserves narrow Supervisor base and independently settles Audit", async () => {
    const scope = supervisorScope();
    const request = vi.fn(async (path: string) => {
      if (path === "/v1/staff/operational-context") return supervisorContext();
      if (path === "/v1/staff/dashboard/feature-authority") {
        return {
          feature: "MANAGEMENT_AUDIT",
          organizationId: organization.organizationId,
          role: "VALET_SUPERVISOR",
          scope: { kind: "LOCATION", locationId: location.locationId },
        };
      }
      throw new Error(path);
    });
    const authority = await resolveNavigationAuthority({
      api: client(request),
      registrations: [visitRegistration, auditRegistration, mapsRegistration],
      selectedScope: scope,
    });
    expect(authority).toMatchObject({
      commercial: { dashboardAccess: false, basicBranding: false, subscriptionRead: false },
      foundationEntryEligible: true,
      locationMapsEligible: true,
      features: { VISIT_CONTACTS: "NOT_APPLICABLE", MANAGEMENT_AUDIT: "ELIGIBLE" },
    });
  });

  it("hides denied Supervisor Audit without erasing narrow Maps/Foundation", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/v1/staff/operational-context") return supervisorContext();
      throw new DashboardApiError({ kind: "authorization", message: "revoked" });
    });
    const authority = await resolveNavigationAuthority({
      api: client(request),
      registrations: [auditRegistration, mapsRegistration],
      selectedScope: supervisorScope(),
    });
    expect(authority.foundationEntryEligible).toBe(true);
    expect(authority.locationMapsEligible).toBe(true);
    expect(authority.features.MANAGEMENT_AUDIT).toBe("DENIED");
  });

  it("drops all Supervisor base authority when the current Shift is gone", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/v1/staff/operational-context") return { contexts: [] };
      if (path === "/v1/staff/dashboard/feature-authority") {
        return {
          feature: "MANAGEMENT_AUDIT",
          organizationId: organization.organizationId,
          role: "VALET_SUPERVISOR",
          scope: { kind: "LOCATION", locationId: location.locationId },
        };
      }
      throw new Error(path);
    });
    const authority = await resolveNavigationAuthority({
      api: client(request),
      registrations: [auditRegistration, mapsRegistration],
      selectedScope: supervisorScope(),
    });
    expect(authority.foundationEntryEligible).toBe(false);
    expect(authority.locationMapsEligible).toBe(false);
    expect(authority.features.MANAGEMENT_AUDIT).toBe("DENIED");
  });

  it("does not promote subscription-only scope even when persisted D is true", async () => {
    const scope: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN_SUBSCRIPTION",
      organization,
    };
    const request = vi.fn().mockResolvedValue({
      organizationId: organization.organizationId,
      subscription: {
        planCode: "PRO",
        status: "ACTIVE",
        entitlements: { basicBranding: true, dashboardAccess: true, reportExports: true },
      },
    });
    const authority = await resolveNavigationAuthority({
      api: client(request),
      registrations: [visitRegistration, auditRegistration],
      selectedScope: scope,
    });
    expect(authority).toMatchObject({
      commercial: { dashboardAccess: false, basicBranding: false, subscriptionRead: true },
      foundationEntryEligible: false,
      locationMapsEligible: false,
    });
    expect(authority.features.VISIT_CONTACTS).toBe("NOT_APPLICABLE");
    expect(authority.features.MANAGEMENT_AUDIT).toBe("NOT_APPLICABLE");
  });
});

function supervisorScope(): SelectedDashboardScope {
  return {
    authority: "SUPERVISOR",
    context: {
      activeShift: {
        locationId: location.locationId,
        shiftId,
        startedAt: "2026-09-22T08:00:00Z",
        status: "ACTIVE",
      },
      authority: "SUPERVISOR",
      location: {
        code: location.code,
        currency: location.currency,
        locationId: location.locationId,
        name: location.name,
      },
      membershipId,
      organization: { name: organization.name, organizationId: organization.organizationId },
    },
  };
}

function supervisorContext() {
  const scope = supervisorScope();
  if (scope.authority !== "SUPERVISOR") throw new Error("Unexpected scope.");
  return {
    contexts: [{
      activeShift: scope.context.activeShift,
      eligibleLocations: [scope.context.location],
      membershipId,
      organization: scope.context.organization,
      role: "VALET_SUPERVISOR",
    }],
  };
}
