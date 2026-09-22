import type {
  DashboardFeatureAuthorityFeature,
  DashboardFeatureAuthorityResponse,
} from "@valet/contracts";

import type { SelectedDashboardScope } from "../scope";

export interface DashboardFeatureTarget {
  readonly compatibleBase: boolean;
  readonly expectedRole: "LOCATION_MANAGER" | "ORG_ADMIN" | "VALET_SUPERVISOR";
  readonly expectedScope: "LOCATION" | "ORGANIZATION" | "ORGANIZATION_GRANT_SET";
  readonly feature: DashboardFeatureAuthorityFeature;
  readonly locationId?: string;
  readonly organizationId: string;
}

export function dashboardFeatureTarget(
  scope: SelectedDashboardScope,
  feature: DashboardFeatureAuthorityFeature,
): DashboardFeatureTarget | null {
  switch (feature) {
    case "VISIT_CONTACTS":
      return visitContactsTarget(scope);
    case "MANAGEMENT_AUDIT":
      return auditTarget(scope);
    default:
      return assertNever(feature);
  }
}

export function dashboardFeatureTargetKey(target: DashboardFeatureTarget): string {
  return [
    target.feature,
    target.organizationId,
    target.expectedRole,
    target.expectedScope,
    target.locationId ?? "-",
  ].join(":");
}

export function matchesDashboardFeatureAuthority(
  target: DashboardFeatureTarget,
  authority: DashboardFeatureAuthorityResponse,
): boolean {
  if (
    authority.feature !== target.feature ||
    authority.organizationId !== target.organizationId ||
    authority.role !== target.expectedRole ||
    authority.scope.kind !== target.expectedScope
  ) {
    return false;
  }
  return target.expectedScope !== "LOCATION" ||
    (authority.scope.kind === "LOCATION" &&
      authority.scope.locationId === target.locationId);
}

function visitContactsTarget(
  scope: SelectedDashboardScope,
): DashboardFeatureTarget | null {
  if (
    scope.authority === "COMPANY_ADMIN" &&
    scope.context.scope.kind === "ALL_LOCATIONS"
  ) {
    return {
      compatibleBase: true,
      expectedRole: "ORG_ADMIN",
      expectedScope: "ORGANIZATION",
      feature: "VISIT_CONTACTS",
      organizationId: scope.context.organization.organizationId,
    };
  }
  if (scope.authority === "LOCATION_MANAGER_GRANT_SET") {
    return {
      compatibleBase: false,
      expectedRole: "LOCATION_MANAGER",
      expectedScope: "ORGANIZATION_GRANT_SET",
      feature: "VISIT_CONTACTS",
      organizationId: scope.organization.organizationId,
    };
  }
  return null;
}

function auditTarget(
  scope: SelectedDashboardScope,
): DashboardFeatureTarget | null {
  if (scope.authority === "COMPANY_ADMIN") {
    const locationId = scope.context.scope.kind === "LOCATION"
      ? scope.context.scope.locationId
      : undefined;
    return {
      compatibleBase: true,
      expectedRole: "ORG_ADMIN",
      expectedScope: locationId === undefined ? "ORGANIZATION" : "LOCATION",
      feature: "MANAGEMENT_AUDIT",
      organizationId: scope.context.organization.organizationId,
      ...(locationId === undefined ? {} : { locationId }),
    };
  }
  if (scope.authority === "LOCATION_MANAGER") {
    return {
      compatibleBase: scope.location.status === "ACTIVE",
      expectedRole: "LOCATION_MANAGER",
      expectedScope: "LOCATION",
      feature: "MANAGEMENT_AUDIT",
      locationId: scope.location.locationId,
      organizationId: scope.organization.organizationId,
    };
  }
  if (scope.authority === "SUPERVISOR") {
    return {
      compatibleBase: true,
      expectedRole: "VALET_SUPERVISOR",
      expectedScope: "LOCATION",
      feature: "MANAGEMENT_AUDIT",
      locationId: scope.context.location.locationId,
      organizationId: scope.context.organization.organizationId,
    };
  }
  return null;
}

function assertNever(value: never): never {
  throw new Error("Unsupported Dashboard feature authority target: " + String(value));
}
