import { describe, expect, it, vi } from "vitest";
import type { ManagementLocation } from "@valet/contracts";

import { noNavigationAuthority } from "../../lib/navigation";
import type { SelectedDashboardScope } from "./scope-entry-types";
import {
  proveLocationSwitchCandidate,
  type LocationSwitchAuthorityDependencies,
} from "./location-switch-authority";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Central Valet",
  timezone: "Asia/Amman",
};
const locationA = location(
  "22222222-2222-4222-8222-222222222222",
  "AMM-A",
  "Amman A",
);
const locationB = location(
  "33333333-3333-4333-8333-333333333333",
  "AMM-B",
  "Amman B",
);

describe("Location switch candidate authority proof", () => {
  it("fresh-resolves Company Admin context once and reuses proven base authority", async () => {
    const resolveContext = vi.fn(async () => companyScope(locationB).context);
    const subscription = vi.fn(async () => companySubscription());
    const resolveNavigation = vi.fn(async () => fullNavigation());
    const deps = dependencies({
      readCompanyAdminSubscription: subscription,
      resolveCompanyAdminContext: resolveContext,
      resolveNavigationAuthority: resolveNavigation,
    });

    const result = await proveLocationSwitchCandidate(
      {
        accessRequirement: "DASHBOARD",
        api: {} as never,
        candidate: { kind: "LOCATION", location: locationB },
        currentPath: "/vehicles",
        currentScope: companyScope(locationA),
        requestKey: "switch:1",
        signal: new AbortController().signal,
      },
      deps,
    );

    expect(result).toMatchObject({ kind: "READY", destination: null });
    expect(resolveContext).toHaveBeenCalledOnce();
    expect(subscription).toHaveBeenCalledOnce();
    expect(resolveNavigation).toHaveBeenCalledWith(
      expect.objectContaining({
        baseResolution: expect.objectContaining({ status: "valid" }),
      }),
    );
  });

  it("denies a Location Manager option missing from the fresh grant page", async () => {
    const list = vi.fn(async () => ({ items: [locationA], nextCursor: null }));
    const resolveNavigation = vi.fn(async () => fullNavigation());
    const deps = dependencies({
      listLocationManagerLocations: list,
      resolveNavigationAuthority: resolveNavigation,
    });

    const result = await proveLocationSwitchCandidate(
      {
        accessRequirement: "DASHBOARD",
        api: {} as never,
        candidate: { kind: "LOCATION", location: locationB },
        currentPath: "/vehicles",
        currentScope: managerScope(locationA),
        requestKey: "switch:2",
        signal: new AbortController().signal,
      },
      deps,
    );

    expect(result).toEqual({ kind: "DENIED" });
    expect(list).toHaveBeenCalledOnce();
    expect(resolveNavigation).not.toHaveBeenCalled();
  });

  it("re-proves a Location Manager page-2 option using its discovery cursor", async () => {
    const list = vi.fn(async () => ({ items: [locationB], nextCursor: null }));
    const deps = dependencies({
      listLocationManagerLocations: list,
      resolveNavigationAuthority: vi.fn(async () => fullNavigation()),
    });

    const result = await proveLocationSwitchCandidate(
      {
        accessRequirement: "DASHBOARD",
        api: {} as never,
        candidate: {
          kind: "LOCATION",
          location: locationB,
          proofCursor: "cursorABCDEFG",
        },
        currentPath: "/vehicles",
        currentScope: managerScope(locationA),
        requestKey: "switch:page2",
        signal: new AbortController().signal,
      },
      deps,
    );

    expect(result).toMatchObject({ kind: "READY", destination: null });
    expect(list).toHaveBeenCalledWith(
      expect.anything(),
      organization.organizationId,
      { cursor: "cursorABCDEFG" },
      expect.any(AbortSignal),
    );
  });

  it("uses authorized navigation as fallback when All Locations cannot keep an exact route", async () => {
    const resolveNavigation = vi.fn(async () => fullNavigation());
    const deps = dependencies({
      resolveCompanyAdminContext: vi.fn(async () => companyScope(null).context),
      resolveNavigationAuthority: resolveNavigation,
    });

    const result = await proveLocationSwitchCandidate(
      {
        accessRequirement: "DASHBOARD",
        api: {} as never,
        candidate: { kind: "ALL_LOCATIONS" },
        currentPath: "/live-operations",
        currentScope: companyScope(locationA),
        requestKey: "switch:3",
        signal: new AbortController().signal,
      },
      deps,
    );

    expect(result).toMatchObject({ kind: "READY", destination: "/overview" });
    expect(resolveNavigation).toHaveBeenCalledOnce();
  });

  it("uses the canonical inactive CA status and falls back from an exact route", async () => {
    const inactiveB = { ...locationB, status: "INACTIVE" as const };
    const deps = dependencies({
      resolveCompanyAdminContext: vi.fn(
        async () => companyScope(inactiveB).context,
      ),
      resolveNavigationAuthority: vi.fn(async () => fullNavigation()),
    });
    const result = await proveLocationSwitchCandidate(
      {
        accessRequirement: "DASHBOARD",
        api: {} as never,
        candidate: { kind: "LOCATION", location: locationB },
        currentPath: "/vehicles",
        currentScope: companyScope(locationA),
        requestKey: "switch:inactive",
        signal: new AbortController().signal,
      },
      deps,
    );
    expect(result).toMatchObject({ kind: "READY", destination: "/overview" });
  });
});

function dependencies(
  overrides: Partial<LocationSwitchAuthorityDependencies>,
): LocationSwitchAuthorityDependencies {
  return {
    listLocationManagerLocations: async () => ({
      items: [locationB],
      nextCursor: null,
    }),
    readCompanyAdminSubscription: async () => companySubscription(),
    readLocationManagerSubscription: async (_api, locationId) => ({
      locationId,
      organizationId: organization.organizationId,
      subscription: subscriptionState(),
    }),
    resolveCompanyAdminContext: async () => companyScope(locationA).context,
    resolveNavigationAuthority: async () => noNavigationAuthority,
    ...overrides,
  };
}

function fullNavigation() {
  return {
    ...noNavigationAuthority,
    commercial: {
      basicBranding: true,
      dashboardAccess: true,
      subscriptionRead: true,
    },
    foundationEntryEligible: true,
    locationMapsEligible: true,
    managementIntelligenceEligible: true,
  };
}

function companyScope(
  selected: ManagementLocation | null,
): Extract<SelectedDashboardScope, { authority: "COMPANY_ADMIN" }> {
  return {
    authority: "COMPANY_ADMIN",
    context: {
      capabilities: selected
        ? ["LOCATION_DASHBOARD_READ"]
        : ["COMPANY_DASHBOARD_READ", "ALL_LOCATIONS_SCOPE_SELECT"],
      organization,
      scope: selected
        ? { kind: "LOCATION", locationId: selected.locationId }
        : { kind: "ALL_LOCATIONS" },
      selectedLocation: selected,
    },
  };
}

function managerScope(
  selected: ManagementLocation,
): Extract<SelectedDashboardScope, { authority: "LOCATION_MANAGER" }> {
  return { authority: "LOCATION_MANAGER", organization, location: selected };
}

function companySubscription() {
  return {
    organizationId: organization.organizationId,
    subscription: subscriptionState(),
  };
}

function subscriptionState() {
  return {
    entitlements: {
      basicBranding: true,
      dashboardAccess: true,
      reportExports: true,
    },
    planCode: "PRO",
    status: "ACTIVE" as const,
  };
}

function location(locationId: string, code: string, name: string) {
  return {
    code,
    currency: "JOD",
    locationId,
    name,
    status: "ACTIVE" as const,
    timezone: "Asia/Amman",
  };
}
