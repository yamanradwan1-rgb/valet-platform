import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  isDefinitiveRestorationFailure,
  restoreSelectedDashboardScope,
} from "./selected-scope-restoration";
import type { SelectedScopeRestorationHint } from "./selected-scope-restoration-hint";

const api = {} as DashboardApiClient;
const session = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "99999999-9999-4999-8999-999999999999";
const locationId = "22222222-2222-4222-8222-222222222222";
const otherLocationId = "77777777-7777-4777-8777-777777777777";
const membershipId = "33333333-3333-4333-8333-333333333333";
const shiftId = "44444444-4444-4444-8444-444444444444";
const organization = { organizationId, name: "Fresh Org", timezone: "Asia/Amman" };
const location = {
  locationId,
  name: "Fresh Location",
  code: "FRESH",
  status: "ACTIVE" as const,
  timezone: "Asia/Amman",
  currency: "JOD",
};

const companyLocationHint: SelectedScopeRestorationHint = {
  authority: "COMPANY_ADMIN",
  organizationId,
  scope: { kind: "LOCATION", locationId },
  staffAuthSessionId: session,
  version: 1,
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    listActiveSupervisorScopes: vi.fn().mockResolvedValue([]),
    listCompanyAdminOrganizations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    listLocationManagerLocations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    listLocationManagerOrganizations: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    resolveCompanyAdminContext: vi.fn().mockResolvedValue({
      capabilities: [], organization, scope: { kind: "LOCATION", locationId }, selectedLocation: location,
    }),
    ...overrides,
  };
}

describe("server-authoritative selected scope restoration", () => {
  it("restores Company Admin exact Location from the fresh server context", async () => {
    const deps = dependencies();
    const result = await restoreSelectedDashboardScope(
      api,
      companyLocationHint,
      undefined,
      deps,
    );
    expect(result).toEqual({
      authority: "COMPANY_ADMIN",
      context: {
        capabilities: [],
        organization,
        scope: { kind: "LOCATION", locationId },
        selectedLocation: location,
      },
    });
    expect(deps.resolveCompanyAdminContext).toHaveBeenCalledWith(
      api, organizationId, { kind: "LOCATION", locationId }, undefined,
    );
  });

  it("restores Company Admin ALL_LOCATIONS only on exact server agreement", async () => {
    const hint: SelectedScopeRestorationHint = {
      authority: "COMPANY_ADMIN",
      organizationId,
      scope: { kind: "ALL_LOCATIONS" },
      staffAuthSessionId: session,
      version: 1,
    };
    const context = {
      capabilities: [], organization, scope: { kind: "ALL_LOCATIONS" as const }, selectedLocation: null,
    };
    await expect(restoreSelectedDashboardScope(api, hint, undefined, dependencies({
      resolveCompanyAdminContext: vi.fn().mockResolvedValue(context),
    }))).resolves.toEqual({ authority: "COMPANY_ADMIN", context });
  });

  it.each([
    ["organization mismatch", {
      capabilities: [], organization: { ...organization, organizationId: otherOrganizationId }, scope: { kind: "LOCATION", locationId }, selectedLocation: location,
    }],
    ["scope/location mismatch", {
      capabilities: [], organization, scope: { kind: "LOCATION", locationId: otherLocationId }, selectedLocation: { ...location, locationId: otherLocationId },
    }],
    ["inactive selected location", {
      capabilities: [], organization, scope: { kind: "LOCATION", locationId }, selectedLocation: { ...location, status: "INACTIVE" as const },
    }],
  ])("denies Company Admin on %s", async (_label, context) => {
    await expect(restoreSelectedDashboardScope(api, companyLocationHint, undefined, dependencies({
      resolveCompanyAdminContext: vi.fn().mockResolvedValue(context),
    }))).resolves.toBeNull();
  });

  it("restores Supervisor only from the exact current membership/location/active shift candidate", async () => {
    const candidate = {
      authority: "SUPERVISOR" as const,
      membershipId,
      organization: { organizationId, name: "Fresh Org" },
      location: { ...location, status: undefined } as never,
      activeShift: { locationId, shiftId, startedAt: "2026-10-06T10:00:00Z", status: "ACTIVE" as const },
    };
    const hint: SelectedScopeRestorationHint = {
      authority: "SUPERVISOR", organizationId, membershipId, locationId, shiftId,
      staffAuthSessionId: session, version: 1,
    };
    await expect(restoreSelectedDashboardScope(api, hint, undefined, dependencies({
      listActiveSupervisorScopes: vi.fn().mockResolvedValue([candidate]),
    }))).resolves.toEqual({ authority: "SUPERVISOR", context: candidate });
  });

  it.each([
    ["ended/changed shift", { shiftId: otherLocationId }],
    ["changed membership", { membershipId: otherLocationId }],
    ["changed location", { locationId: otherLocationId }],
  ])("denies Supervisor with %s", async (_label, change) => {
    const hint: SelectedScopeRestorationHint = {
      authority: "SUPERVISOR", organizationId, membershipId, locationId, shiftId,
      staffAuthSessionId: session, version: 1,
    };
    const candidate = {
      authority: "SUPERVISOR" as const,
      membershipId: "membershipId" in change ? change.membershipId : membershipId,
      organization: { organizationId, name: "Org" },
      location: {
        code: "LOC", currency: "JOD", locationId: "locationId" in change ? change.locationId : locationId,
        name: "Loc", timezone: "Asia/Amman",
      },
      activeShift: {
        locationId: "locationId" in change ? change.locationId : locationId,
        shiftId: "shiftId" in change ? change.shiftId : shiftId,
        startedAt: "2026-10-06T10:00:00Z", status: "ACTIVE" as const,
      },
    };
    await expect(restoreSelectedDashboardScope(api, hint, undefined, dependencies({
      listActiveSupervisorScopes: vi.fn().mockResolvedValue([candidate]),
    }))).resolves.toBeNull();
  });

  it.each(["COMPANY_ADMIN_SUBSCRIPTION", "LOCATION_MANAGER_GRANT_SET"] as const)(
    "reconstructs %s organization from its current authority listing",
    async (authority) => {
      const hint = { authority, organizationId, staffAuthSessionId: session, version: 1 } as const;
      const list = vi.fn().mockResolvedValue({ items: [organization], nextCursor: null });
      const deps = authority === "COMPANY_ADMIN_SUBSCRIPTION"
        ? dependencies({ listCompanyAdminOrganizations: list })
        : dependencies({ listLocationManagerOrganizations: list });
      await expect(restoreSelectedDashboardScope(api, hint, undefined, deps))
        .resolves.toEqual({ authority, organization });
    },
  );

  it("classifies only current auth/authorization denial as definitive revocation", () => {
    expect(isDefinitiveRestorationFailure(new DashboardApiError({ kind: "authorization", message: "denied" }))).toBe(true);
    expect(isDefinitiveRestorationFailure(new DashboardApiError({ kind: "auth", message: "logged out" }))).toBe(true);
    expect(isDefinitiveRestorationFailure(new DashboardApiError({ kind: "network", message: "offline" }))).toBe(false);
    expect(isDefinitiveRestorationFailure(new DashboardApiError({ kind: "mfa", message: "verify" }))).toBe(false);
  });
});
