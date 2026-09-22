import { CircleHelp } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { DashboardNavigationRegistration } from "../../lib/navigation/navigation-types";
import type { SelectedDashboardScope } from "../scope";
import { resolveNavigationAuthority } from "./resolve-navigation-authority";
import { revalidateSelectedScope } from "./revalidate-selected-scope";
import { shouldInvalidateSelectedScopeAfterRouteDenial } from "./use-selected-scope-revalidation";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const scope: SelectedDashboardScope = {
  authority: "COMPANY_ADMIN",
  context: {
    capabilities: [],
    organization,
    scope: { kind: "ALL_LOCATIONS" },
    selectedLocation: null,
  },
};
const visitRegistration = registration("visit", "VISIT_CONTACTS");
const auditRegistration = registration("audit", "MANAGEMENT_AUDIT");

function registration(
  id: string,
  accessRequirement: "VISIT_CONTACTS" | "MANAGEMENT_AUDIT",
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
    roles: ["COMPANY_ADMIN"],
    scopeRequirement: "ORGANIZATION",
  };
}

function subscription() {
  return {
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

function context() {
  return {
    capabilities: [],
    organization,
    scope: { kind: "ALL_LOCATIONS" as const },
    selectedLocation: null,
  };
}

function feature(name: "VISIT_CONTACTS" | "MANAGEMENT_AUDIT") {
  return {
    feature: name,
    organizationId: organization.organizationId,
    role: "ORG_ADMIN" as const,
    scope: { kind: "ORGANIZATION" as const },
  };
}

function client(request: ReturnType<typeof vi.fn>): DashboardApiClient {
  return { request } as unknown as DashboardApiClient;
}

describe("protected route and navigation authority separation", () => {
  it("does not let prior navigation eligibility authorize a later denied route", async () => {
    let routeUse = false;
    const request = vi.fn(async (path: string, _schema: unknown, options?: {
      readonly query?: { readonly feature?: "VISIT_CONTACTS" | "MANAGEMENT_AUDIT" };
    }) => {
      if (path.endsWith("/subscription")) return subscription();
      if (path.endsWith("/context")) return context();
      if (path === "/v1/staff/dashboard/feature-authority") {
        if (routeUse) {
          throw new DashboardApiError({
            kind: "authorization",
            message: "Authority changed",
            status: 404,
          });
        }
        const requestedFeature = options?.query?.feature;
        if (requestedFeature === undefined) throw new Error("Missing feature query.");
        return feature(requestedFeature);
      }
      throw new Error(path);
    });
    const api = client(request);
    const navigation = await resolveNavigationAuthority({
      api,
      registrations: [visitRegistration],
      selectedScope: scope,
    });
    expect(navigation.features.VISIT_CONTACTS).toBe("ELIGIBLE");

    routeUse = true;
    await expect(
      revalidateSelectedScope(api, scope, "VISIT_CONTACTS"),
    ).rejects.toMatchObject({ kind: "authorization" });
  });

  it("keeps a valid protected route independent from a sibling nav probe failure", async () => {
    const request = vi.fn(async (path: string) => {
      if (path.endsWith("/subscription")) return subscription();
      if (path.endsWith("/context")) return context();
      if (path === "/v1/staff/dashboard/feature-authority") {
        throw new DashboardApiError({ kind: "network", message: "Audit unavailable" });
      }
      throw new Error(path);
    });
    const api = client(request);
    const navigation = await resolveNavigationAuthority({
      api,
      registrations: [auditRegistration],
      selectedScope: scope,
    });
    expect(navigation.features.MANAGEMENT_AUDIT).toBe("UNAVAILABLE");
    await expect(
      revalidateSelectedScope(api, scope, "FOUNDATION_ENTRY"),
    ).resolves.toMatchObject({
      status: "valid",
      routeAccess: { foundationEntryAuthorized: true },
    });
  });

  it("rejects a schema-valid wrong-feature response on protected use", async () => {
    const request = vi.fn(async (path: string) => {
      if (path === "/v1/staff/dashboard/feature-authority") {
        return feature("MANAGEMENT_AUDIT");
      }
      throw new Error("Base revalidation must not run after correlation failure.");
    });
    await expect(
      revalidateSelectedScope(client(request), scope, "VISIT_CONTACTS"),
    ).resolves.toEqual({ status: "denied", routeAccess: null });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retains a valid scope on feature denial but clears a definitively invalid base", async () => {
    const validBaseRequest = vi.fn(async (path: string) => {
      if (path.endsWith("/subscription")) return subscription();
      if (path.endsWith("/context")) return context();
      throw new Error(path);
    });
    await expect(shouldInvalidateSelectedScopeAfterRouteDenial({
      accessRequirement: "VISIT_CONTACTS",
      api: client(validBaseRequest),
      selectedScope: scope,
    })).resolves.toBe(false);

    const invalidBaseRequest = vi.fn(async (path: string) => {
      if (path.endsWith("/subscription")) {
        return {
          ...subscription(),
          organizationId: "99999999-9999-4999-8999-999999999999",
        };
      }
      throw new Error(path);
    });
    await expect(shouldInvalidateSelectedScopeAfterRouteDenial({
      accessRequirement: "VISIT_CONTACTS",
      api: client(invalidBaseRequest),
      selectedScope: scope,
    })).resolves.toBe(true);
  });

  it("does not duplicate a compatible base read when that completed base is denied", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(feature("VISIT_CONTACTS"))
      .mockResolvedValueOnce({
        ...subscription(),
        organizationId: "99999999-9999-4999-8999-999999999999",
      });
    await expect(
      revalidateSelectedScope(client(request), scope, "VISIT_CONTACTS"),
    ).resolves.toEqual({
      status: "denied",
      routeAccess: null,
      selectedScopeInvalid: true,
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("never treats feature MFA denial as proof that the selected scope is invalid", async () => {
    const request = vi.fn();
    await expect(shouldInvalidateSelectedScopeAfterRouteDenial({
      accessRequirement: "VISIT_CONTACTS",
      api: client(request),
      reason: new DashboardApiError({
        kind: "mfa",
        message: "Step-up required",
        status: 403,
      }),
      selectedScope: scope,
    })).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("never clears a selected scope solely because ordinary route revalidation needs MFA", async () => {
    const request = vi.fn();
    await expect(shouldInvalidateSelectedScopeAfterRouteDenial({
      accessRequirement: "DASHBOARD",
      api: client(request),
      reason: new DashboardApiError({
        kind: "mfa",
        message: "Standard MFA required",
        status: 403,
      }),
      selectedScope: scope,
    })).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
