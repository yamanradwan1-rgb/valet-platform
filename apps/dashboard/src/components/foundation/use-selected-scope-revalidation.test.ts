import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import type { SelectedDashboardScope } from "../scope";
import {
  classifyScopeRevalidationFailure,
  revalidateSelectedScope,
  selectedScopeRevalidationKey,
} from "./use-selected-scope-revalidation";

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

function apiWith(request: ReturnType<typeof vi.fn>): DashboardApiClient {
  return { request } as unknown as DashboardApiClient;
}

describe("selected scope revalidation helpers", () => {
  it("keys Supervisor validity to session, identity, membership, location, and exact shift", () => {
    const scope: SelectedDashboardScope = {
      authority: "SUPERVISOR",
      context: {
        authority: "SUPERVISOR",
        membershipId: "33333333-3333-4333-8333-333333333333",
        organization: { organizationId: organization.organizationId, name: organization.name },
        location: {
          locationId: location.locationId,
          name: location.name,
          code: location.code,
          currency: location.currency,
        },
        activeShift: {
          locationId: location.locationId,
          shiftId: "44444444-4444-4444-8444-444444444444",
          startedAt: "2026-09-20T00:00:00Z",
          status: "ACTIVE",
        },
      },
    };
    expect(selectedScopeRevalidationKey(11, 7, 5, "DASHBOARD", scope)).toContain(
      "11:7:5:DASHBOARD:sup:11111111-1111-4111-8111-111111111111:33333333-3333-4333-8333-333333333333:22222222-2222-4222-8222-222222222222:22222222-2222-4222-8222-222222222222:44444444-4444-4444-8444-444444444444:ACTIVE",
    );
  });

  it("checks CA subscription before context and stops on unavailable entitlement", async () => {
    const request = vi.fn().mockResolvedValueOnce({
      organizationId: organization.organizationId,
      subscription: null,
    });
    const scope: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN",
      context: {
        organization,
        scope: { kind: "ALL_LOCATIONS" },
        selectedLocation: null,
        capabilities: [],
      },
    };

    await expect(
      revalidateSelectedScope(apiWith(request), scope, "DASHBOARD"),
    ).resolves.toEqual({ status: "entitlement", routeAccess: null });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toContain("/subscription");
  });

  it("allows CA subscription recovery without Management context or D-access", async () => {
    const request = vi.fn().mockResolvedValue({
      organizationId: organization.organizationId,
      subscription: {
        planCode: "PRO",
        status: "ACTIVE",
        entitlements: {
          dashboardAccess: false,
          reportExports: true,
          basicBranding: true,
        },
      },
    });
    const scope: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN_SUBSCRIPTION",
      organization,
    };

    await expect(
      revalidateSelectedScope(apiWith(request), scope, "SUBSCRIPTION_READ"),
    ).resolves.toEqual({
      status: "valid",
      routeAccess: {
        foundationEntryAuthorized: false,
        locationMapsAuthorized: false,
        commercial: {
          dashboardAccess: false,
          basicBranding: true,
          subscriptionRead: true,
        },
      },
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[0]).toContain("/subscription");
    expect(request.mock.calls[0]?.[0]).not.toContain("/context");
  });

  it("does not let a CA subscription recovery scope enter D-access routes", async () => {
    const request = vi.fn();
    const scope: SelectedDashboardScope = {
      authority: "COMPANY_ADMIN_SUBSCRIPTION",
      organization,
    };

    await expect(
      revalidateSelectedScope(apiWith(request), scope, "DASHBOARD"),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
    await expect(
      revalidateSelectedScope(apiWith(request), scope, "BRANDING"),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
    expect(request).not.toHaveBeenCalled();
  });

  it("uses the LM subscription read for recovery while keeping D-access gated", async () => {
    const request = vi.fn().mockResolvedValue({
      organizationId: organization.organizationId,
      locationId: location.locationId,
      subscription: {
        planCode: "PRO",
        status: "ACTIVE",
        entitlements: { dashboardAccess: false, reportExports: true, basicBranding: true },
      },
    });
    const scope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location,
    };

    await expect(
      revalidateSelectedScope(apiWith(request), scope, "SUBSCRIPTION_READ"),
    ).resolves.toEqual({
      status: "valid",
      routeAccess: {
        foundationEntryAuthorized: false,
        locationMapsAuthorized: true,
        commercial: {
          dashboardAccess: false,
          basicBranding: true,
          subscriptionRead: true,
        },
      },
    });
    await expect(
      revalidateSelectedScope(apiWith(request), scope, "DASHBOARD"),
    ).resolves.toEqual({ status: "entitlement", routeAccess: null });
  });

  it("rejects inactive or mismatched LM subscription recovery scope", async () => {
    const response = {
      organizationId: organization.organizationId,
      locationId: location.locationId,
      subscription: null,
    };
    const inactiveScope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location: { ...location, status: "INACTIVE" },
    };
    await expect(
      revalidateSelectedScope(
        apiWith(vi.fn().mockResolvedValue(response)),
        inactiveScope,
        "SUBSCRIPTION_READ",
      ),
    ).resolves.toEqual({ status: "denied", routeAccess: null });

    const activeScope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location,
    };
    await expect(
      revalidateSelectedScope(
        apiWith(vi.fn().mockResolvedValue({ ...response, organizationId: "99999999-9999-4999-8999-999999999999" })),
        activeScope,
        "SUBSCRIPTION_READ",
      ),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
  });

  it("requires an exact current Supervisor shift and safely classifies API failures", async () => {
    const scope: SelectedDashboardScope = {
      authority: "SUPERVISOR",
      context: {
        authority: "SUPERVISOR",
        membershipId: "33333333-3333-4333-8333-333333333333",
        organization: { organizationId: organization.organizationId, name: organization.name },
        location: {
          locationId: location.locationId,
          name: location.name,
          code: location.code,
          currency: location.currency,
        },
        activeShift: {
          locationId: location.locationId,
          shiftId: "44444444-4444-4444-8444-444444444444",
          startedAt: "2026-09-20T00:00:00Z",
          status: "ACTIVE",
        },
      },
    };
    const request = vi.fn().mockResolvedValue({ contexts: [] });
    await expect(
      revalidateSelectedScope(apiWith(request), scope, "DASHBOARD"),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
    await expect(
      revalidateSelectedScope(apiWith(request), scope, "SUBSCRIPTION_READ"),
    ).resolves.toEqual({ status: "denied", routeAccess: null });

    expect(
      classifyScopeRevalidationFailure(
        new DashboardApiError({ kind: "authorization", status: 404, message: "Hidden" }),
      ),
    ).toEqual({ status: "denied", errorKind: "authorization" });
    expect(
      classifyScopeRevalidationFailure(
        new DashboardApiError({ kind: "network", message: "Offline" }),
      ),
    ).toEqual({ status: "error", errorKind: "network" });
  });

  it("fences a rapid exact-Location switch from an older Location generation", () => {
    const guard = new ScopeGenerationGuard();
    const oldScope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location,
    };
    const newScope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location: {
        ...location,
        locationId: "55555555-5555-4555-8555-555555555555",
        name: "Second",
      },
    };
    const oldTicket = guard.begin();
    const newTicket = guard.begin();

    expect(selectedScopeRevalidationKey(13, 8, 1, "DASHBOARD", oldScope)).not.toBe(
      selectedScopeRevalidationKey(13, 8, 1, "DASHBOARD", newScope),
    );
    expect(oldTicket.signal.aborted).toBe(true);
    expect(guard.accept(oldTicket, oldScope)).toBeUndefined();
    expect(guard.accept(newTicket, newScope)).toBe(newScope);
  });

  it("changes the protected key when only the Staff session generation advances", () => {
    const scope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location,
    };

    expect(selectedScopeRevalidationKey(21, 9, 1, "DASHBOARD", scope)).not.toBe(
      selectedScopeRevalidationKey(22, 9, 1, "DASHBOARD", scope),
    );
  });

  it("changes the protected key when only the route access requirement changes", () => {
    const scope: SelectedDashboardScope = {
      authority: "LOCATION_MANAGER",
      organization,
      location,
    };

    expect(selectedScopeRevalidationKey(21, 9, 1, "DASHBOARD", scope)).not.toBe(
      selectedScopeRevalidationKey(21, 9, 1, "SUBSCRIPTION_READ", scope),
    );
  });
});
