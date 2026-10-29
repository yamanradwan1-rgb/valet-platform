import { describe, expect, it, vi } from "vitest";
import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { resolveNavigation } from "../../lib/navigation/navigation-registry";
import { md03NavigationRegistrations } from "../../features/operations/operations-navigation";
import type { SelectedDashboardScope } from "../scope";
import { resolveNavigationAuthority } from "./resolve-navigation-authority";
import { revalidateSelectedScope } from "./revalidate-selected-scope";

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const shiftId = "44444444-4444-4444-8444-444444444444";
const organization = { organizationId, name: "Org", timezone: "Asia/Amman" };
const location = { locationId, name: "Main", code: "MAIN", currency: "JOD", timezone: "Asia/Amman" };
const activeShift = { shiftId, locationId, startedAt: "2026-10-29T06:00:00Z", status: "ACTIVE" as const };
const supervisor: SelectedDashboardScope = {
  authority: "SUPERVISOR",
  context: {
    authority: "SUPERVISOR", membershipId, activeShift, location,
    organization: { organizationId, name: "Org" },
  },
};

function operationalContext(overrides: {
  readonly membershipId?: string;
  readonly locationId?: string;
  readonly shiftId?: string;
  readonly organizationId?: string;
  readonly active?: boolean;
} = {}) {
  const currentLocationId = overrides.locationId ?? locationId;
  return {
    contexts: [{
      role: "VALET_SUPERVISOR" as const,
      membershipId: overrides.membershipId ?? membershipId,
      organization: { organizationId: overrides.organizationId ?? organizationId, name: "Org" },
      eligibleLocations: [{ ...location, locationId: currentLocationId }],
      activeShift: overrides.active === false ? null : {
        ...activeShift, shiftId: overrides.shiftId ?? shiftId, locationId: currentLocationId,
      },
    }],
  };
}

function api(response: unknown) {
  const request = vi.fn(async (path: string) => {
    if (path !== "/v1/staff/operational-context") throw new Error(`Unexpected ${path}`);
    return response;
  });
  return { client: { request } as unknown as DashboardApiClient, request };
}

describe("dedicated Emergency Tasks Supervisor access", () => {
  it("preserves CA and LM Dashboard entitlement without adding Supervisor commercial rights", async () => {
    const managementLocation = { ...location, status: "ACTIVE" as const };
    const company: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN",
      context: {
        organization,
        scope: { kind: "LOCATION", locationId },
        selectedLocation: managementLocation,
        capabilities: [],
      },
    };
    const manager: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER", organization, location: managementLocation,
    };
    const subscription = (dashboardAccess: boolean) => ({
      planCode: "PRO", status: "ACTIVE",
      entitlements: { dashboardAccess, basicBranding: false, reportExports: false },
    });
    const companyRequest = vi.fn()
      .mockResolvedValueOnce({ organizationId, subscription: subscription(true) })
      .mockResolvedValueOnce(company.context);
    const companyResult = await revalidateSelectedScope(
      { request: companyRequest } as unknown as DashboardApiClient,
      company, "EMERGENCY_TASKS",
    );
    expect(companyResult).toMatchObject({ status: "valid", routeAccess: { emergencyTasksAuthorized: true } });
    for (const access of [true, false]) {
      const managerRequest = vi.fn().mockResolvedValue({
        organizationId, locationId, subscription: subscription(access),
      });
      const result = await revalidateSelectedScope(
        { request: managerRequest } as unknown as DashboardApiClient,
        manager, "EMERGENCY_TASKS",
      );
      expect(result.status).toBe(access ? "valid" : "entitlement");
      expect(result.routeAccess?.emergencyTasksAuthorized).toBe(access ? true : undefined);
    }
  });

  it("revalidates exact active Shift and offers only existing Tasks/Maps navigation", async () => {
    const { client, request } = api(operationalContext());
    const route = await revalidateSelectedScope(client, supervisor, "EMERGENCY_TASKS");
    expect(route).toMatchObject({
      status: "valid",
      routeAccess: {
        emergencyTasksAuthorized: true,
        commercial: { dashboardAccess: false, basicBranding: false, subscriptionRead: false },
      },
    });
    const navigation = await resolveNavigationAuthority({
      api: client, selectedScope: supervisor, registrations: md03NavigationRegistrations,
    });
    expect(navigation.emergencyTasksEligible).toBe(true);
    expect(navigation.commercial.dashboardAccess).toBe(false);
    for (const locale of ["en", "ar"] as const) {
      const visible = resolveNavigation(
        md03NavigationRegistrations,
        { role: "SUPERVISOR", organizationId, locationId },
        locale, navigation,
      );
      expect(visible.map(({ id }) => id)).toEqual(["tasks", "maps-zones"]);
      expect(visible[0]?.href).toBe("/tasks");
      expect(visible[0]?.icon).toBe(md03NavigationRegistrations[2]?.icon);
      expect(visible[0]?.label).toBe(md03NavigationRegistrations[2]?.labels[locale]);
    }
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["revoked Shift", operationalContext({ active: false })],
    ["different membership", operationalContext({ membershipId: "55555555-5555-4555-8555-555555555555" })],
    ["different Location", operationalContext({ locationId: "66666666-6666-4666-8666-666666666666" })],
    ["different Shift", operationalContext({ shiftId: "77777777-7777-4777-8777-777777777777" })],
    ["different Organization", operationalContext({ organizationId: "88888888-8888-4888-8888-888888888888" })],
  ])("denies %s without management fallback", async (_case, context) => {
    const { client } = api(context);
    await expect(revalidateSelectedScope(client, supervisor, "EMERGENCY_TASKS"))
      .resolves.toEqual({ status: "denied", routeAccess: null });
    const navigation = await resolveNavigationAuthority({
      api: client, selectedScope: supervisor, registrations: md03NavigationRegistrations,
    });
    expect(navigation.emergencyTasksEligible).toBe(false);
    expect(navigation.commercial.dashboardAccess).toBe(false);
  });
});
