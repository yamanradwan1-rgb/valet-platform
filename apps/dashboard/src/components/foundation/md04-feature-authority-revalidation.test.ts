import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { noDashboardCommercialAccess } from "../../lib/scope/dashboard-commercial-access";
import type { SelectedDashboardScope } from "../scope";
import { revalidateSelectedScope } from "./revalidate-selected-scope";
import { selectedScopeRevalidationKey } from "./selected-scope-revalidation-policy";

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

function api(request: ReturnType<typeof vi.fn>): DashboardApiClient {
  return { request } as unknown as DashboardApiClient;
}

function subscription(basicBranding = true, dashboardAccess = true) {
  return {
    planCode: "PRO",
    status: "ACTIVE" as const,
    entitlements: { dashboardAccess, reportExports: false, basicBranding },
  };
}

function companyScope(location = false): SelectedDashboardScope {
  return {
    authority: "COMPANY_ADMIN",
    context: {
      capabilities: [],
      organization,
      scope: location
        ? { kind: "LOCATION", locationId: activeLocation.locationId }
        : { kind: "ALL_LOCATIONS" },
      selectedLocation: location ? activeLocation : null,
    },
  };
}

const lmActive: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER", organization, location: activeLocation,
};
const lmInactive: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER", organization, location: inactiveLocation,
};
const lmGrantSet: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER_GRANT_SET", organization,
};
const supervisor: Extract<SelectedDashboardScope, { authority: "SUPERVISOR" }> = {
  authority: "SUPERVISOR",
  context: {
    activeShift: {
      locationId: activeLocation.locationId,
      shiftId,
      startedAt: "2026-09-22T00:00:00Z",
      status: "ACTIVE",
    },
    authority: "SUPERVISOR",
    location: {
      code: activeLocation.code,
      currency: activeLocation.currency,
      locationId: activeLocation.locationId,
      name: activeLocation.name,
    },
    membershipId,
    organization: { organizationId: organization.organizationId, name: organization.name },
  },
};

const specialVisitAccess = {
  commercial: noDashboardCommercialAccess,
  foundationEntryAuthorized: false,
  locationMapsAuthorized: false,
  managementAuditAuthorized: false,
  visitContactsAuthorized: true,
};
const specialAuditAccess = {
  ...specialVisitAccess,
  managementAuditAuthorized: true,
  visitContactsAuthorized: false,
};

function feature(
  requirement: "MANAGEMENT_AUDIT" | "VISIT_CONTACTS",
  role: "LOCATION_MANAGER" | "ORG_ADMIN" | "VALET_SUPERVISOR",
  scope: { readonly kind: "ORGANIZATION" | "ORGANIZATION_GRANT_SET" } |
    { readonly kind: "LOCATION"; readonly locationId: string },
) {
  return { feature: requirement, organizationId: organization.organizationId, role, scope };
}

function companySubscription(basicBranding = true, dashboardAccess = true) {
  return { organizationId: organization.organizationId, subscription: subscription(basicBranding, dashboardAccess) };
}

function companyContext(location = false) {
  return {
    capabilities: [],
    organization,
    scope: location
      ? { kind: "LOCATION" as const, locationId: activeLocation.locationId }
      : { kind: "ALL_LOCATIONS" as const },
    selectedLocation: location ? activeLocation : null,
  };
}

function locationManagerSubscription(basicBranding = true) {
  return {
    locationId: activeLocation.locationId,
    organizationId: organization.organizationId,
    subscription: subscription(basicBranding),
  };
}

function supervisorContext() {
  return {
    contexts: [{
      activeShift: supervisor.context.activeShift,
      eligibleLocations: [supervisor.context.location],
      membershipId,
      organization: supervisor.context.organization,
      role: "VALET_SUPERVISOR" as const,
    }],
  };
}

function paths(request: ReturnType<typeof vi.fn>): string[] {
  return request.mock.calls.map((call) => String(call[0]));
}

describe("MD-04 Foundation feature authority revalidation", () => {
  it("keeps LM Visit Contacts grant-set feature-only", async () => {
    const request = vi.fn().mockResolvedValue(feature(
      "VISIT_CONTACTS", "LOCATION_MANAGER", { kind: "ORGANIZATION_GRANT_SET" },
    ));
    await expect(revalidateSelectedScope(api(request), lmGrantSet, "VISIT_CONTACTS"))
      .resolves.toEqual({ status: "valid", routeAccess: specialVisitAccess });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[2]?.query).toEqual({
      feature: "VISIT_CONTACTS", organizationId: organization.organizationId,
    });
  });

  it("adds CA Visit Contacts to current Organization Foundation/commercial truth", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(feature("VISIT_CONTACTS", "ORG_ADMIN", { kind: "ORGANIZATION" }))
      .mockResolvedValueOnce(companySubscription())
      .mockResolvedValueOnce(companyContext());
    await expect(revalidateSelectedScope(api(request), companyScope(), "VISIT_CONTACTS"))
      .resolves.toEqual({
        status: "valid",
        routeAccess: {
          commercial: { dashboardAccess: true, basicBranding: true, subscriptionRead: true },
          foundationEntryAuthorized: true,
          locationMapsAuthorized: false,
          managementAuditAuthorized: false,
          visitContactsAuthorized: true,
        },
      });
    expect(paths(request)).toEqual([
      "/v1/staff/dashboard/feature-authority",
      `/v1/staff/management/organizations/${organization.organizationId}/subscription`,
      `/v1/staff/management/organizations/${organization.organizationId}/context`,
    ]);
  });

  it("adds CA Audit to Organization and exact active-Location base access", async () => {
    for (const location of [false, true]) {
      const authorityScope = location
        ? { kind: "LOCATION" as const, locationId: activeLocation.locationId }
        : { kind: "ORGANIZATION" as const };
      const request = vi.fn()
        .mockResolvedValueOnce(feature("MANAGEMENT_AUDIT", "ORG_ADMIN", authorityScope))
        .mockResolvedValueOnce(companySubscription(false))
        .mockResolvedValueOnce(companyContext(location));
      const result = await revalidateSelectedScope(
        api(request), companyScope(location), "MANAGEMENT_AUDIT",
      );
      expect(result).toEqual({
        status: "valid",
        routeAccess: {
          commercial: { dashboardAccess: true, basicBranding: false, subscriptionRead: true },
          foundationEntryAuthorized: true,
          locationMapsAuthorized: location,
          managementAuditAuthorized: true,
          visitContactsAuthorized: false,
        },
      });
      expect(request.mock.calls[0]?.[2]?.query).toEqual({
        feature: "MANAGEMENT_AUDIT",
        organizationId: organization.organizationId,
        ...(location ? { locationId: activeLocation.locationId } : {}),
      });
    }
  });

  it("adds LM Audit to current active exact-Location base access", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(feature(
        "MANAGEMENT_AUDIT", "LOCATION_MANAGER",
        { kind: "LOCATION", locationId: activeLocation.locationId },
      ))
      .mockResolvedValueOnce(locationManagerSubscription());
    await expect(revalidateSelectedScope(api(request), lmActive, "MANAGEMENT_AUDIT"))
      .resolves.toEqual({
        status: "valid",
        routeAccess: {
          commercial: { dashboardAccess: true, basicBranding: true, subscriptionRead: true },
          foundationEntryAuthorized: true,
          locationMapsAuthorized: true,
          managementAuditAuthorized: true,
          visitContactsAuthorized: false,
        },
      });
    expect(paths(request)).toEqual([
      "/v1/staff/dashboard/feature-authority",
      `/v1/staff/dashboard/locations/${activeLocation.locationId}/subscription`,
    ]);
  });

  it("keeps inactive LM Audit feature-only", async () => {
    const request = vi.fn().mockResolvedValue(feature(
      "MANAGEMENT_AUDIT", "LOCATION_MANAGER",
      { kind: "LOCATION", locationId: inactiveLocation.locationId },
    ));
    await expect(revalidateSelectedScope(api(request), lmInactive, "MANAGEMENT_AUDIT"))
      .resolves.toEqual({ status: "valid", routeAccess: specialAuditAccess });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("adds Supervisor Audit only to its current narrow Foundation/Maps access", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(feature(
        "MANAGEMENT_AUDIT", "VALET_SUPERVISOR",
        { kind: "LOCATION", locationId: activeLocation.locationId },
      ))
      .mockResolvedValueOnce(supervisorContext());
    await expect(revalidateSelectedScope(api(request), supervisor, "MANAGEMENT_AUDIT"))
      .resolves.toEqual({
        status: "valid",
        routeAccess: {
          commercial: noDashboardCommercialAccess,
          foundationEntryAuthorized: true,
          locationMapsAuthorized: true,
          managementAuditAuthorized: true,
          visitContactsAuthorized: false,
        },
      });
    expect(paths(request)).toEqual([
      "/v1/staff/dashboard/feature-authority",
      "/v1/staff/operational-context",
    ]);
    const stale = vi.fn()
      .mockResolvedValueOnce(feature(
        "MANAGEMENT_AUDIT", "VALET_SUPERVISOR",
        { kind: "LOCATION", locationId: activeLocation.locationId },
      ))
      .mockResolvedValueOnce({ contexts: [] });
    await expect(revalidateSelectedScope(api(stale), supervisor, "MANAGEMENT_AUDIT"))
      .resolves.toMatchObject({ status: "denied", selectedScopeInvalid: true });
  });

  it("does not downgrade a later compatible-base denial into feature-only success", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(feature("VISIT_CONTACTS", "ORG_ADMIN", { kind: "ORGANIZATION" }))
      .mockResolvedValueOnce(companySubscription(true, false));
    await expect(revalidateSelectedScope(api(request), companyScope(), "VISIT_CONTACTS"))
      .resolves.toEqual({ status: "entitlement", routeAccess: null });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("fails closed on incompatible or changed role/scope and preserves feature generation keys", async () => {
    const exactRequest = vi.fn();
    await expect(revalidateSelectedScope(api(exactRequest), lmActive, "VISIT_CONTACTS"))
      .resolves.toEqual({ status: "denied", routeAccess: null });
    expect(exactRequest).not.toHaveBeenCalled();

    const changedRole = vi.fn().mockResolvedValue(feature(
      "VISIT_CONTACTS", "ORG_ADMIN", { kind: "ORGANIZATION" },
    ));
    await expect(revalidateSelectedScope(api(changedRole), lmGrantSet, "VISIT_CONTACTS"))
      .resolves.toEqual({ status: "denied", routeAccess: null });
    expect(selectedScopeRevalidationKey(7, 9, 3, "VISIT_CONTACTS", lmGrantSet))
      .toBe(`7:9:3:VISIT_CONTACTS:lm-grant-set:${organization.organizationId}`);
  });
});
