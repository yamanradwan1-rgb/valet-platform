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

const lmGrantSet: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER_GRANT_SET",
  organization,
};

const lmInactive: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER",
  organization,
  location: inactiveLocation,
};

const supervisor: SelectedDashboardScope = {
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

const visitAccess = {
  commercial: noDashboardCommercialAccess,
  foundationEntryAuthorized: false,
  locationMapsAuthorized: false,
  managementAuditAuthorized: false,
  visitContactsAuthorized: true,
};
const auditAccess = { ...visitAccess, managementAuditAuthorized: true, visitContactsAuthorized: false };

describe("MD-04 Foundation feature authority revalidation", () => {
  it("revalidates LM Visit Contacts at Organization grant-set scope", async () => {
    const request = vi.fn().mockResolvedValue({
      feature: "VISIT_CONTACTS",
      organizationId: organization.organizationId,
      role: "LOCATION_MANAGER",
      scope: { kind: "ORGANIZATION_GRANT_SET" },
    });
    await expect(revalidateSelectedScope(api(request), lmGrantSet, "VISIT_CONTACTS"))
      .resolves.toEqual({ status: "valid", routeAccess: visitAccess });
    expect(request.mock.calls[0]?.[0]).toBe("/v1/staff/dashboard/feature-authority");
    expect(request.mock.calls[0]?.[2]?.query).toEqual({
      feature: "VISIT_CONTACTS", organizationId: organization.organizationId,
    });
  });

  it("never aliases exact LM Location scope into Visit Contacts", async () => {
    const request = vi.fn();
    await expect(revalidateSelectedScope(api(request), lmInactive, "VISIT_CONTACTS"))
      .resolves.toEqual({ status: "denied", routeAccess: null });
    expect(request).not.toHaveBeenCalled();
  });

  it("requires CA Visit Contacts to remain Organization/All Locations scoped", async () => {
    const response = {
      feature: "VISIT_CONTACTS",
      organizationId: organization.organizationId,
      role: "ORG_ADMIN",
      scope: { kind: "ORGANIZATION" },
    };
    await expect(revalidateSelectedScope(
      api(vi.fn().mockResolvedValue(response)), companyScope(), "VISIT_CONTACTS",
    )).resolves.toEqual({ status: "valid", routeAccess: visitAccess });
    const request = vi.fn();
    await expect(revalidateSelectedScope(api(request), companyScope(true), "VISIT_CONTACTS"))
      .resolves.toEqual({ status: "denied", routeAccess: null });
    expect(request).not.toHaveBeenCalled();
  });

  it("supports CA Organization/exact-Location and inactive granted LM Audit", async () => {
    for (const [scope, response] of [
      [companyScope(), { role: "ORG_ADMIN", scope: { kind: "ORGANIZATION" } }],
      [companyScope(true), { role: "ORG_ADMIN", scope: { kind: "LOCATION", locationId: activeLocation.locationId } }],
      [lmInactive, { role: "LOCATION_MANAGER", scope: { kind: "LOCATION", locationId: activeLocation.locationId } }],
    ] as const) {
      const request = vi.fn().mockResolvedValue({
        feature: "MANAGEMENT_AUDIT",
        organizationId: organization.organizationId,
        ...response,
      });
      await expect(revalidateSelectedScope(api(request), scope, "MANAGEMENT_AUDIT"))
        .resolves.toEqual({ status: "valid", routeAccess: auditAccess });
    }
  });

  it("keeps Supervisor exact selected Shift current before probing Audit authority", async () => {
    const operational = {
      contexts: [{
        activeShift: supervisor.context.activeShift,
        eligibleLocations: [supervisor.context.location],
        membershipId,
        organization: supervisor.context.organization,
        role: "VALET_SUPERVISOR",
      }],
    };
    const authority = {
      feature: "MANAGEMENT_AUDIT",
      organizationId: organization.organizationId,
      role: "VALET_SUPERVISOR",
      scope: { kind: "LOCATION", locationId: activeLocation.locationId },
    };
    const request = vi.fn().mockResolvedValueOnce(operational).mockResolvedValueOnce(authority);
    await expect(revalidateSelectedScope(api(request), supervisor, "MANAGEMENT_AUDIT"))
      .resolves.toEqual({ status: "valid", routeAccess: auditAccess });
    expect(request).toHaveBeenCalledTimes(2);

    const stale = vi.fn().mockResolvedValue({ contexts: [] });
    await expect(revalidateSelectedScope(api(stale), supervisor, "MANAGEMENT_AUDIT"))
      .resolves.toEqual({ status: "denied", routeAccess: null });
    expect(stale).toHaveBeenCalledTimes(1);
  });

  it("fails closed on changed server role/scope and keys grant-set by feature generations", async () => {
    const request = vi.fn().mockResolvedValue({
      feature: "VISIT_CONTACTS",
      organizationId: organization.organizationId,
      role: "ORG_ADMIN",
      scope: { kind: "ORGANIZATION" },
    });
    await expect(revalidateSelectedScope(api(request), lmGrantSet, "VISIT_CONTACTS"))
      .resolves.toEqual({ status: "denied", routeAccess: null });
    expect(selectedScopeRevalidationKey(7, 9, "VISIT_CONTACTS", lmGrantSet))
      .toBe(`7:9:VISIT_CONTACTS:lm-grant-set:${organization.organizationId}`);
  });
});
