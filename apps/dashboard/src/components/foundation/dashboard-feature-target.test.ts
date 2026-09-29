import { describe, expect, it } from "vitest";

import type { SelectedDashboardScope } from "../scope";
import {
  dashboardFeatureTarget,
  matchesDashboardFeatureAuthority,
} from "./dashboard-feature-target";

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

function company(locationScope = false): SelectedDashboardScope {
  return {
    authority: "COMPANY_ADMIN",
    context: {
      capabilities: [],
      organization,
      scope: locationScope
        ? { kind: "LOCATION", locationId: location.locationId }
        : { kind: "ALL_LOCATIONS" },
      selectedLocation: locationScope ? location : null,
    },
  };
}

const grantSet: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER_GRANT_SET",
  organization,
};
const lmActive: SelectedDashboardScope = {
  authority: "LOCATION_MANAGER",
  organization,
  location,
};
const lmInactive: SelectedDashboardScope = {
  ...lmActive,
  location: { ...location, status: "INACTIVE" as const },
};
const supervisor: SelectedDashboardScope = {
  authority: "SUPERVISOR",
  context: {
    activeShift: {
      locationId: location.locationId,
      shiftId: "33333333-3333-4333-8333-333333333333",
      startedAt: "2026-09-22T08:00:00Z",
      status: "ACTIVE",
    },
    authority: "SUPERVISOR",
    location: {
      code: location.code,
      currency: location.currency,
      locationId: location.locationId,
      name: location.name,
      timezone: location.timezone,
    },
    membershipId: "44444444-4444-4444-8444-444444444444",
    organization: {
      name: organization.name,
      organizationId: organization.organizationId,
    },
  },
};

describe("dashboard feature targets", () => {
  it("maps every accepted selected scope to its exact server target", () => {
    expect(dashboardFeatureTarget(company(), "VISIT_CONTACTS")).toMatchObject({
      compatibleBase: true,
      expectedRole: "ORG_ADMIN",
      expectedScope: "ORGANIZATION",
      feature: "VISIT_CONTACTS",
    });
    expect(dashboardFeatureTarget(company(), "MANAGEMENT_AUDIT")).toMatchObject({
      expectedRole: "ORG_ADMIN",
      expectedScope: "ORGANIZATION",
    });
    expect(dashboardFeatureTarget(company(true), "MANAGEMENT_AUDIT")).toMatchObject({
      expectedRole: "ORG_ADMIN",
      expectedScope: "LOCATION",
      locationId: location.locationId,
    });
    expect(dashboardFeatureTarget(grantSet, "VISIT_CONTACTS")).toMatchObject({
      compatibleBase: false,
      expectedRole: "LOCATION_MANAGER",
      expectedScope: "ORGANIZATION_GRANT_SET",
    });
    expect(dashboardFeatureTarget(lmActive, "MANAGEMENT_AUDIT")).toMatchObject({
      compatibleBase: true,
      expectedRole: "LOCATION_MANAGER",
      expectedScope: "LOCATION",
    });
    expect(dashboardFeatureTarget(lmInactive, "MANAGEMENT_AUDIT")).toMatchObject({
      compatibleBase: false,
      expectedRole: "LOCATION_MANAGER",
      expectedScope: "LOCATION",
    });
    expect(dashboardFeatureTarget(supervisor, "MANAGEMENT_AUDIT")).toMatchObject({
      compatibleBase: true,
      expectedRole: "VALET_SUPERVISOR",
      expectedScope: "LOCATION",
      locationId: location.locationId,
    });
  });

  it("returns no target for incompatible feature/scope combinations", () => {
    expect(dashboardFeatureTarget(company(true), "VISIT_CONTACTS")).toBeNull();
    expect(dashboardFeatureTarget(lmActive, "VISIT_CONTACTS")).toBeNull();
    expect(dashboardFeatureTarget(grantSet, "MANAGEMENT_AUDIT")).toBeNull();
    expect(dashboardFeatureTarget(supervisor, "VISIT_CONTACTS")).toBeNull();
  });

  it("requires exact feature, Organization, role, scope kind, and Location", () => {
    const organizationTarget = dashboardFeatureTarget(company(), "VISIT_CONTACTS")!;
    const correctOrganization = {
      feature: "VISIT_CONTACTS" as const,
      organizationId: organization.organizationId,
      role: "ORG_ADMIN" as const,
      scope: { kind: "ORGANIZATION" as const },
    };
    expect(matchesDashboardFeatureAuthority(organizationTarget, correctOrganization)).toBe(true);
    expect(matchesDashboardFeatureAuthority(organizationTarget, {
      ...correctOrganization,
      feature: "MANAGEMENT_AUDIT",
    })).toBe(false);
    expect(matchesDashboardFeatureAuthority(organizationTarget, {
      ...correctOrganization,
      organizationId: "55555555-5555-4555-8555-555555555555",
    })).toBe(false);
    expect(matchesDashboardFeatureAuthority(organizationTarget, {
      ...correctOrganization,
      role: "LOCATION_MANAGER",
    })).toBe(false);
    expect(matchesDashboardFeatureAuthority(organizationTarget, {
      ...correctOrganization,
      scope: { kind: "ORGANIZATION_GRANT_SET" as const },
    })).toBe(false);

    const locationTarget = dashboardFeatureTarget(company(true), "MANAGEMENT_AUDIT")!;
    const correctLocation = {
      feature: "MANAGEMENT_AUDIT" as const,
      organizationId: organization.organizationId,
      role: "ORG_ADMIN" as const,
      scope: { kind: "LOCATION" as const, locationId: location.locationId },
    };
    expect(matchesDashboardFeatureAuthority(locationTarget, correctLocation)).toBe(true);
    expect(matchesDashboardFeatureAuthority(locationTarget, {
      ...correctLocation,
      scope: {
        kind: "LOCATION" as const,
        locationId: "66666666-6666-4666-8666-666666666666",
      },
    })).toBe(false);
  });
});
