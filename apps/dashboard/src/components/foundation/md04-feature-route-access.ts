import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  noDashboardCommercialAccess,
  type DashboardRouteAccess,
} from "../../lib/scope/dashboard-commercial-access";
import { readDashboardFeatureAuthority } from "../../lib/scope/dashboard-scope";
import type { SelectedDashboardScope } from "../scope";

export type Md04FeatureRequirement = "MANAGEMENT_AUDIT" | "VISIT_CONTACTS";

export interface Md04FeatureRevalidationResult {
  readonly status: "valid" | "entitlement" | "denied";
  readonly routeAccess: DashboardRouteAccess | null;
}

type BaseRevalidator = () => Promise<Md04FeatureRevalidationResult>;

interface FeatureTarget {
  readonly compatibleBase: boolean;
  readonly expectedRole: "LOCATION_MANAGER" | "ORG_ADMIN" | "VALET_SUPERVISOR";
  readonly expectedScope: "LOCATION" | "ORGANIZATION" | "ORGANIZATION_GRANT_SET";
  readonly locationId?: string;
  readonly organizationId: string;
}

const featureOnlyBaseAccess: DashboardRouteAccess = {
  commercial: noDashboardCommercialAccess,
  foundationEntryAuthorized: false,
  locationMapsAuthorized: false,
};

export function withMd04FeatureAuthority(
  baseAccess: DashboardRouteAccess,
  requirement: Md04FeatureRequirement,
): DashboardRouteAccess {
  return {
    ...baseAccess,
    managementAuditAuthorized: requirement === "MANAGEMENT_AUDIT",
    visitContactsAuthorized: requirement === "VISIT_CONTACTS",
  };
}

function featureOnlyAccess(requirement: Md04FeatureRequirement): DashboardRouteAccess {
  return withMd04FeatureAuthority(featureOnlyBaseAccess, requirement);
}

function visitContactsTarget(scope: SelectedDashboardScope): FeatureTarget | null {
  if (
    scope.authority === "COMPANY_ADMIN" &&
    scope.context.scope.kind === "ALL_LOCATIONS"
  ) {
    return {
      compatibleBase: true,
      expectedRole: "ORG_ADMIN",
      expectedScope: "ORGANIZATION",
      organizationId: scope.context.organization.organizationId,
    };
  }
  if (scope.authority === "LOCATION_MANAGER_GRANT_SET") {
    return {
      compatibleBase: false,
      expectedRole: "LOCATION_MANAGER",
      expectedScope: "ORGANIZATION_GRANT_SET",
      organizationId: scope.organization.organizationId,
    };
  }
  return null;
}

function auditTarget(scope: SelectedDashboardScope): FeatureTarget | null {
  if (scope.authority === "COMPANY_ADMIN") {
    const locationId = scope.context.scope.kind === "LOCATION"
      ? scope.context.scope.locationId
      : undefined;
    return {
      compatibleBase: true,
      expectedRole: "ORG_ADMIN",
      expectedScope: locationId === undefined ? "ORGANIZATION" : "LOCATION",
      organizationId: scope.context.organization.organizationId,
      ...(locationId === undefined ? {} : { locationId }),
    };
  }
  if (scope.authority === "LOCATION_MANAGER") {
    return {
      compatibleBase: scope.location.status === "ACTIVE",
      expectedRole: "LOCATION_MANAGER",
      expectedScope: "LOCATION",
      locationId: scope.location.locationId,
      organizationId: scope.organization.organizationId,
    };
  }
  if (scope.authority === "SUPERVISOR") {
    return {
      compatibleBase: true,
      expectedRole: "VALET_SUPERVISOR",
      expectedScope: "LOCATION",
      locationId: scope.context.location.locationId,
      organizationId: scope.context.organization.organizationId,
    };
  }
  return null;
}

export async function revalidateMd04FeatureAuthority(
  api: DashboardApiClient,
  scope: SelectedDashboardScope,
  requirement: Md04FeatureRequirement,
  revalidateCompatibleBase: BaseRevalidator,
  signal?: AbortSignal,
): Promise<Md04FeatureRevalidationResult> {
  const target = requirement === "VISIT_CONTACTS"
    ? visitContactsTarget(scope)
    : auditTarget(scope);
  if (target === null) return { status: "denied", routeAccess: null };

  const authority = await readDashboardFeatureAuthority(api, {
    feature: requirement,
    organizationId: target.organizationId,
    ...(target.locationId === undefined ? {} : { locationId: target.locationId }),
  }, signal);
  const scopeMatches = target.expectedScope === "LOCATION"
    ? authority.scope.kind === "LOCATION" &&
      authority.scope.locationId === target.locationId
    : authority.scope.kind === target.expectedScope;
  if (
    authority.organizationId !== target.organizationId ||
    authority.role !== target.expectedRole ||
    !scopeMatches
  ) {
    return { status: "denied", routeAccess: null };
  }

  if (!target.compatibleBase) {
    return { status: "valid", routeAccess: featureOnlyAccess(requirement) };
  }
  const base = await revalidateCompatibleBase();
  if (base.status !== "valid" || base.routeAccess === null) return base;
  return {
    status: "valid",
    routeAccess: withMd04FeatureAuthority(base.routeAccess, requirement),
  };
}
