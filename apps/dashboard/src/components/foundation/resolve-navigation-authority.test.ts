import { CircleHelp } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { resolveNavigation } from "../../lib/navigation/navigation-registry";
import type { DashboardNavigationRegistration } from "../../lib/navigation/navigation-types";
import type { SelectedDashboardScope } from "../scope";
import { resolveNavigationAuthority } from "./resolve-navigation-authority";

const organization = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  name: "Org",
  timezone: "Asia/Amman",
};
const locationId = "22222222-2222-4222-8222-222222222222";

const registrations = [
  registration("visit", "/visit", "VISIT_CONTACTS"),
  registration("visit-two", "/visit-two", "VISIT_CONTACTS"),
  registration("audit", "/audit", "MANAGEMENT_AUDIT"),
  { ...registration("planned", "/planned", "MANAGEMENT_AUDIT"), availability: "PLANNED" },
] satisfies readonly DashboardNavigationRegistration[];

function registration(
  id: string,
  href: string,
  accessRequirement: "VISIT_CONTACTS" | "MANAGEMENT_AUDIT",
): DashboardNavigationRegistration {
  return {
    accessRequirement,
    availability: "IMPLEMENTED",
    href,
    icon: CircleHelp,
    id,
    labels: { ar: id, en: id },
    owner: "MD-04",
    placement: "MAIN",
    roles: ["COMPANY_ADMIN"],
    scopeRequirement: "ORGANIZATION",
  };
}

function company(location = false): SelectedDashboardScope {
  const selectedLocation = location
    ? {
        code: "MAIN",
        currency: "JOD",
        locationId,
        name: "Main",
        status: "ACTIVE" as const,
        timezone: "Asia/Amman",
      }
    : null;
  return {
    authority: "COMPANY_ADMIN",
    context: {
      capabilities: [],
      organization,
      scope: location
        ? { kind: "LOCATION", locationId }
        : { kind: "ALL_LOCATIONS" },
      selectedLocation,
    },
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

function context(exactLocation = false) {
  return {
    capabilities: [],
    organization,
    scope: exactLocation
      ? { kind: "LOCATION" as const, locationId }
      : { kind: "ALL_LOCATIONS" as const },
    selectedLocation: exactLocation
      ? {
          code: "MAIN",
          currency: "JOD",
          locationId,
          name: "Main",
          status: "ACTIVE" as const,
          timezone: "Asia/Amman",
        }
      : null,
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

function api(
  featureResult: (
    featureName: "VISIT_CONTACTS" | "MANAGEMENT_AUDIT",
  ) => unknown | Promise<unknown>,
) {
  const request = vi.fn(async (path: string, _schema: unknown, options?: {
    readonly query?: {
      readonly feature?: "VISIT_CONTACTS" | "MANAGEMENT_AUDIT";
      readonly scopeKind?: "ALL_LOCATIONS" | "LOCATION";
    };
  }) => {
    if (path.endsWith("/subscription")) return subscription();
    if (path.endsWith("/context")) return context(options?.query?.scopeKind === "LOCATION");
    if (path === "/v1/staff/dashboard/feature-authority") {
      const requestedFeature = options?.query?.feature;
      if (requestedFeature === undefined) throw new Error("Missing feature query.");
      return featureResult(requestedFeature);
    }
    throw new Error(`Unexpected path ${path}`);
  });
  return { client: { request } as unknown as DashboardApiClient, request };
}

describe("navigation authority resolution", () => {
  it("discovers both MD-04 features independently from an ordinary CA shell", async () => {
    const { client, request } = api((name) => feature(name));
    const authority = await resolveNavigationAuthority({
      api: client,
      registrations,
      selectedScope: company(),
    });
    const visible = resolveNavigation(
      registrations,
      { role: "COMPANY_ADMIN", organizationId: organization.organizationId, locationId: null },
      "en",
      authority,
    );

    expect(authority.features).toEqual({
      MANAGEMENT_AUDIT: "ELIGIBLE",
      VISIT_CONTACTS: "ELIGIBLE",
    });
    expect(visible.map(({ id }) => id)).toEqual(["visit", "visit-two", "audit"]);
    const featureCalls = request.mock.calls.filter(
      ([path]) => path === "/v1/staff/dashboard/feature-authority",
    );
    expect(featureCalls).toHaveLength(2);
    expect(featureCalls.filter((call) => call[2]?.query?.feature === "VISIT_CONTACTS"))
      .toHaveLength(1);
    expect(featureCalls.filter((call) => call[2]?.query?.feature === "MANAGEMENT_AUDIT"))
      .toHaveLength(1);
    expect(request.mock.calls.filter(([path]) => String(path).endsWith("/subscription")))
      .toHaveLength(1);
    expect(request.mock.calls.filter(([path]) => String(path).endsWith("/context")))
      .toHaveLength(1);
  });

  it.each(["authorization", "network"] as const)(
    "keeps Visit Contacts when Audit fails with %s",
    async (kind) => {
      const { client } = api((name) => {
        if (name === "VISIT_CONTACTS") return feature(name);
        throw new DashboardApiError({ kind, message: "No audit" });
      });
      const authority = await resolveNavigationAuthority({
        api: client,
        registrations,
        selectedScope: company(),
      });
      expect(authority.features.VISIT_CONTACTS).toBe("ELIGIBLE");
      expect(authority.features.MANAGEMENT_AUDIT)
        .toBe(kind === "authorization" ? "DENIED" : "UNAVAILABLE");
    },
  );

  it("keeps Audit when Visit Contacts is independently unavailable", async () => {
    const { client } = api((name) => {
      if (name === "MANAGEMENT_AUDIT") return feature(name);
      throw new DashboardApiError({ kind: "network", message: "Visit unavailable" });
    });
    const authority = await resolveNavigationAuthority({
      api: client,
      registrations,
      selectedScope: company(),
    });
    expect(authority.features.VISIT_CONTACTS).toBe("UNAVAILABLE");
    expect(authority.features.MANAGEMENT_AUDIT).toBe("ELIGIBLE");
  });

  it("fails closed when the server-shaped response names the wrong feature", async () => {
    const onlyVisit = [registrations[0]!];
    const { client } = api(() => feature("MANAGEMENT_AUDIT"));
    const authority = await resolveNavigationAuthority({
      api: client,
      registrations: onlyVisit,
      selectedScope: company(),
    });
    expect(authority.features.VISIT_CONTACTS).toBe("DENIED");
  });

  it("does not probe planned or selected-scope-incompatible features", async () => {
    const { client, request } = api((name) => ({
      ...feature(name),
      scope: { kind: "LOCATION", locationId },
    }));
    const authority = await resolveNavigationAuthority({
      api: client,
      registrations,
      selectedScope: company(true),
    });
    expect(authority.features.VISIT_CONTACTS).toBe("NOT_APPLICABLE");
    expect(authority.features.MANAGEMENT_AUDIT).toBe("ELIGIBLE");
    expect(authority.locationMapsEligible).toBe(true);
    const featureCalls = request.mock.calls.filter(
      ([path]) => path === "/v1/staff/dashboard/feature-authority",
    );
    expect(featureCalls).toHaveLength(1);
    expect(featureCalls[0]?.[2]?.query).toMatchObject({
      feature: "MANAGEMENT_AUDIT",
      locationId,
    });
  });

  it("does not probe a feature that exists only in a PLANNED registration", async () => {
    const plannedOnly = [{
      ...registration("planned-only", "/planned-only", "VISIT_CONTACTS"),
      availability: "PLANNED" as const,
    }];
    const { client, request } = api((name) => feature(name));
    await resolveNavigationAuthority({
      api: client,
      registrations: plannedOnly,
      selectedScope: company(),
    });
    expect(request.mock.calls.filter(
      ([path]) => path === "/v1/staff/dashboard/feature-authority",
    )).toHaveLength(0);
  });

  it("settles the canonical base before starting independent feature probes", async () => {
    let releaseContext!: (value: ReturnType<typeof context>) => void;
    const contextGate = new Promise<ReturnType<typeof context>>((resolve) => {
      releaseContext = resolve;
    });
    const request = vi.fn(async (path: string, _schema: unknown, options?: {
      readonly query?: { readonly feature?: "VISIT_CONTACTS" | "MANAGEMENT_AUDIT" };
    }) => {
      if (path.endsWith("/subscription")) return subscription();
      if (path.endsWith("/context")) return contextGate;
      if (path === "/v1/staff/dashboard/feature-authority") {
        const requestedFeature = options?.query?.feature;
        if (requestedFeature === undefined) throw new Error("Missing feature query.");
        return feature(requestedFeature);
      }
      throw new Error(path);
    });
    const resolution = resolveNavigationAuthority({
      api: { request } as unknown as DashboardApiClient,
      registrations,
      selectedScope: company(),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(request.mock.calls.filter(
      ([path]) => path === "/v1/staff/dashboard/feature-authority",
    )).toHaveLength(0);
    releaseContext(context());
    await resolution;
    expect(request.mock.calls.filter(
      ([path]) => path === "/v1/staff/dashboard/feature-authority",
    )).toHaveLength(2);
  });
});
