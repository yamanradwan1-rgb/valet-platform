import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { SelectedDashboardScope } from "../scope";
import { revalidateSelectedScope } from "./revalidate-selected-scope";

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

function companyScope(
  scope: { readonly kind: "LOCATION"; readonly locationId: string } |
    { readonly kind: "ALL_LOCATIONS" } = {
      kind: "LOCATION",
      locationId: location.locationId,
    },
): SelectedDashboardScope {
  return {
    authority: "COMPANY_ADMIN",
    context: {
      organization,
      scope,
      selectedLocation: scope.kind === "LOCATION" ? location : null,
      capabilities: [],
    },
  };
}

const locationManagerScope: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER",
  organization,
  location,
};

const supervisorScope: SelectedDashboardScope = {
  authority: "SUPERVISOR",
  context: {
    authority: "SUPERVISOR",
    membershipId,
    organization: { organizationId: organization.organizationId, name: organization.name },
    location: {
      locationId: location.locationId,
      name: location.name,
      code: location.code,
      currency: location.currency,
      timezone: location.timezone,
    },
    activeShift: {
      locationId: location.locationId,
      shiftId,
      startedAt: "2026-09-21T00:00:00Z",
      status: "ACTIVE",
    },
  },
};

function supervisorContext(overrides: {
  readonly membershipId?: string;
  readonly locationId?: string;
  readonly shiftId?: string;
} = {}) {
  const currentLocationId = overrides.locationId ?? location.locationId;
  return {
    contexts: [{
      role: "VALET_SUPERVISOR" as const,
      membershipId: overrides.membershipId ?? membershipId,
      organization: { organizationId: organization.organizationId, name: organization.name },
      eligibleLocations: [{
        locationId: currentLocationId,
        name: location.name,
        code: location.code,
        currency: location.currency,
        timezone: location.timezone,
      }],
      activeShift: {
        locationId: currentLocationId,
        shiftId: overrides.shiftId ?? shiftId,
        startedAt: "2026-09-21T00:00:00Z",
        status: "ACTIVE" as const,
      },
    }],
  };
}

describe("LOCATION_MAPS selected-scope revalidation", () => {
  it("allows exact active Company Admin Location only with real D-access", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({
        organizationId: organization.organizationId,
        subscription: subscription(true),
      })
      .mockResolvedValueOnce({
        organization,
        scope: { kind: "LOCATION", locationId: location.locationId },
        selectedLocation: location,
        capabilities: [],
      });

    await expect(
      revalidateSelectedScope(api(request), companyScope(), "LOCATION_MAPS"),
    ).resolves.toEqual({
      status: "valid",
      routeAccess: {
        foundationEntryAuthorized: true,
        locationMapsAuthorized: true,
        commercial: {
          dashboardAccess: true,
          basicBranding: false,
          subscriptionRead: true,
        },
      },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("denies Company Admin Maps for no D-access, All Locations, and inactive Location", async () => {
    const noDashboard = vi.fn().mockResolvedValue({
      organizationId: organization.organizationId,
      subscription: subscription(false),
    });
    await expect(
      revalidateSelectedScope(api(noDashboard), companyScope(), "LOCATION_MAPS"),
    ).resolves.toEqual({ status: "entitlement", routeAccess: null });

    const allLocations = vi.fn().mockResolvedValue({
      organizationId: organization.organizationId,
      subscription: subscription(true),
    });
    await expect(
      revalidateSelectedScope(
        api(allLocations),
        companyScope({ kind: "ALL_LOCATIONS" }),
        "LOCATION_MAPS",
      ),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
    expect(allLocations).toHaveBeenCalledTimes(1);

    const inactive = vi.fn()
      .mockResolvedValueOnce({
        organizationId: organization.organizationId,
        subscription: subscription(true),
      })
      .mockResolvedValueOnce({
        organization,
        scope: { kind: "LOCATION", locationId: location.locationId },
        selectedLocation: { ...location, status: "INACTIVE" },
        capabilities: [],
      });
    await expect(
      revalidateSelectedScope(api(inactive), companyScope(), "LOCATION_MAPS"),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
  });

  it("never lets Company Admin subscription recovery enter LOCATION_MAPS", async () => {
    const request = vi.fn();
    const scope: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN_SUBSCRIPTION",
      organization,
    };

    await expect(
      revalidateSelectedScope(api(request), scope, "LOCATION_MAPS"),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "allows exact active LM Maps with D-access=%s while preserving commercial truth",
    async (dashboardAccess) => {
      const request = vi.fn().mockResolvedValue({
        organizationId: organization.organizationId,
        locationId: location.locationId,
        subscription: subscription(dashboardAccess),
      });

      const result = await revalidateSelectedScope(
        api(request),
        locationManagerScope,
        "LOCATION_MAPS",
      );
      expect(result.status).toBe("valid");
      expect(result.routeAccess).toMatchObject({
        locationMapsAuthorized: true,
        commercial: {
          dashboardAccess,
          basicBranding: false,
          subscriptionRead: true,
        },
      });
      expect(result.routeAccess?.foundationEntryAuthorized).toBe(dashboardAccess);
    },
  );

  it("keeps LM generic Dashboard D-gated and rejects inactive or changed scope", async () => {
    const noDashboard = vi.fn().mockResolvedValue({
      organizationId: organization.organizationId,
      locationId: location.locationId,
      subscription: subscription(false),
    });
    await expect(
      revalidateSelectedScope(api(noDashboard), locationManagerScope, "DASHBOARD"),
    ).resolves.toEqual({ status: "entitlement", routeAccess: null });

    await expect(
      revalidateSelectedScope(
        api(vi.fn().mockResolvedValue({
          organizationId: organization.organizationId,
          locationId: location.locationId,
          subscription: subscription(false),
        })),
        { ...locationManagerScope, location: { ...location, status: "INACTIVE" } },
        "LOCATION_MAPS",
      ),
    ).resolves.toEqual({ status: "denied", routeAccess: null });

    await expect(
      revalidateSelectedScope(
        api(vi.fn().mockResolvedValue({
          organizationId: "99999999-9999-4999-8999-999999999999",
          locationId: location.locationId,
          subscription: subscription(false),
        })),
        locationManagerScope,
        "LOCATION_MAPS",
      ),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
  });

  it("allows only the exact active Supervisor Maps scope without commercial authority", async () => {
    await expect(
      revalidateSelectedScope(
        api(vi.fn().mockResolvedValue(supervisorContext())),
        supervisorScope,
        "LOCATION_MAPS",
      ),
    ).resolves.toEqual({
      status: "valid",
      routeAccess: {
        foundationEntryAuthorized: true,
        locationMapsAuthorized: true,
        commercial: {
          dashboardAccess: false,
          basicBranding: false,
          subscriptionRead: false,
        },
      },
    });

    for (const current of [
      { contexts: [] },
      supervisorContext({ membershipId: "55555555-5555-4555-8555-555555555555" }),
      supervisorContext({ locationId: "66666666-6666-4666-8666-666666666666" }),
      supervisorContext({ shiftId: "77777777-7777-4777-8777-777777777777" }),
    ]) {
      await expect(
        revalidateSelectedScope(
          api(vi.fn().mockResolvedValue(current)),
          supervisorScope,
          "LOCATION_MAPS",
        ),
      ).resolves.toEqual({ status: "denied", routeAccess: null });
    }
  });
});
