import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  allowsDashboardCommercialRequirement,
  commercialAccessFromSubscription,
  noDashboardCommercialAccess,
  type DashboardRouteAccess,
  type DashboardRouteAccessRequirement,
} from "../../lib/scope/dashboard-commercial-access";
import {
  listActiveSupervisorScopes,
  readDashboardFeatureAuthority,
  readCompanyAdminSubscription,
  readLocationManagerSubscription,
  resolveCompanyAdminContext,
} from "../../lib/scope/dashboard-scope";
import type { SelectedDashboardScope } from "../scope";
import {
  isActiveExactCompanyLocationContext,
  sameManagementScope,
} from "./selected-scope-revalidation-policy";

function featureRouteAccess(
  requirement: "MANAGEMENT_AUDIT" | "VISIT_CONTACTS",
): DashboardRouteAccess {
  return {
    commercial: noDashboardCommercialAccess,
    foundationEntryAuthorized: false,
    locationMapsAuthorized: false,
    managementAuditAuthorized: requirement === "MANAGEMENT_AUDIT",
    visitContactsAuthorized: requirement === "VISIT_CONTACTS",
  };
}

async function revalidateFeatureAuthority(
  api: DashboardApiClient,
  scope: SelectedDashboardScope,
  requirement: "MANAGEMENT_AUDIT" | "VISIT_CONTACTS",
  signal?: AbortSignal,
): Promise<SettledScopeRevalidation> {
  if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    return { status: "denied", routeAccess: null };
  }

  if (requirement === "VISIT_CONTACTS") {
    const organization = scope.authority === "COMPANY_ADMIN"
      ? scope.context.organization
      : scope.authority === "LOCATION_MANAGER_GRANT_SET"
        ? scope.organization
        : null;
    if (
      organization === null ||
      (scope.authority === "COMPANY_ADMIN" && scope.context.scope.kind !== "ALL_LOCATIONS")
    ) {
      return { status: "denied", routeAccess: null };
    }
    const authority = await readDashboardFeatureAuthority(api, {
      feature: requirement,
      organizationId: organization.organizationId,
    }, signal);
    const matches = authority.organizationId === organization.organizationId &&
      ((scope.authority === "COMPANY_ADMIN" && authority.role === "ORG_ADMIN" &&
        authority.scope.kind === "ORGANIZATION") ||
       (scope.authority === "LOCATION_MANAGER_GRANT_SET" &&
        authority.role === "LOCATION_MANAGER" &&
        authority.scope.kind === "ORGANIZATION_GRANT_SET"));
    return matches
      ? { status: "valid", routeAccess: featureRouteAccess(requirement) }
      : { status: "denied", routeAccess: null };
  }

  let organizationId: string;
  let locationId: string | undefined;
  let expectedRole: "LOCATION_MANAGER" | "ORG_ADMIN" | "VALET_SUPERVISOR";
  if (scope.authority === "COMPANY_ADMIN") {
    organizationId = scope.context.organization.organizationId;
    expectedRole = "ORG_ADMIN";
    locationId = scope.context.scope.kind === "LOCATION"
      ? scope.context.scope.locationId
      : undefined;
  } else if (scope.authority === "LOCATION_MANAGER") {
    organizationId = scope.organization.organizationId;
    locationId = scope.location.locationId;
    expectedRole = "LOCATION_MANAGER";
  } else if (scope.authority === "SUPERVISOR") {
    const current = await listActiveSupervisorScopes(api, signal);
    const exact = current.some((candidate) =>
      candidate.membershipId === scope.context.membershipId &&
      candidate.location.locationId === scope.context.location.locationId &&
      candidate.activeShift.shiftId === scope.context.activeShift.shiftId);
    if (!exact) return { status: "denied", routeAccess: null };
    organizationId = scope.context.organization.organizationId;
    locationId = scope.context.location.locationId;
    expectedRole = "VALET_SUPERVISOR";
  } else {
    return { status: "denied", routeAccess: null };
  }
  const authority = await readDashboardFeatureAuthority(api, {
    feature: requirement,
    organizationId,
    ...(locationId === undefined ? {} : { locationId }),
  }, signal);
  const scopeMatches = locationId === undefined
    ? authority.scope.kind === "ORGANIZATION"
    : authority.scope.kind === "LOCATION" && authority.scope.locationId === locationId;
  return authority.organizationId === organizationId &&
    authority.role === expectedRole && scopeMatches
    ? { status: "valid", routeAccess: featureRouteAccess(requirement) }
    : { status: "denied", routeAccess: null };
}

export interface SettledScopeRevalidation {
  readonly status: "valid" | "entitlement" | "denied";
  readonly routeAccess: DashboardRouteAccess | null;
}

export async function revalidateSelectedScope(
  api: DashboardApiClient,
  scope: SelectedDashboardScope,
  accessRequirement: DashboardRouteAccessRequirement,
  signal?: AbortSignal,
): Promise<SettledScopeRevalidation> {
  if (accessRequirement === "VISIT_CONTACTS" ||
      accessRequirement === "MANAGEMENT_AUDIT") {
    return revalidateFeatureAuthority(api, scope, accessRequirement, signal);
  }
  if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    if (accessRequirement !== "SUBSCRIPTION_READ") {
      return { status: "denied", routeAccess: null };
    }
    const subscription = await readCompanyAdminSubscription(
      api,
      scope.organization.organizationId,
      signal,
    );
    if (subscription.organizationId !== scope.organization.organizationId) {
      return { status: "denied", routeAccess: null };
    }
    return {
      status: "valid",
      routeAccess: {
        foundationEntryAuthorized: false,
        locationMapsAuthorized: false,
        commercial: commercialAccessFromSubscription(subscription.subscription),
      },
    };
  }

  if (scope.authority === "COMPANY_ADMIN") {
    const organizationId = scope.context.organization.organizationId;
    const subscription = await readCompanyAdminSubscription(api, organizationId, signal);
    if (subscription.organizationId !== organizationId) {
      return { status: "denied", routeAccess: null };
    }
    const commercialAccess = commercialAccessFromSubscription(subscription.subscription);
    if (accessRequirement === "SUBSCRIPTION_READ") {
      return {
        status: "valid",
        routeAccess: {
          foundationEntryAuthorized: false,
          locationMapsAuthorized: false,
          commercial: commercialAccess,
        },
      };
    }
    if (accessRequirement === "LOCATION_MAPS") {
      if (scope.context.scope.kind !== "LOCATION") {
        return { status: "denied", routeAccess: null };
      }
      if (!allowsDashboardCommercialRequirement("DASHBOARD", commercialAccess)) {
        return { status: "entitlement", routeAccess: null };
      }
      const context = await resolveCompanyAdminContext(
        api,
        organizationId,
        scope.context.scope,
        signal,
      );
      if (
        context.organization.organizationId !== organizationId ||
        !isActiveExactCompanyLocationContext(context, scope.context.scope)
      ) {
        return { status: "denied", routeAccess: null };
      }
      return {
        status: "valid",
        routeAccess: {
          foundationEntryAuthorized: true,
          locationMapsAuthorized: true,
          commercial: commercialAccess,
        },
      };
    }
    const commercialRequirement =
      accessRequirement === "FOUNDATION_ENTRY" ? "DASHBOARD" : accessRequirement;
    if (!allowsDashboardCommercialRequirement(commercialRequirement, commercialAccess)) {
      return { status: "entitlement", routeAccess: null };
    }
    const context = await resolveCompanyAdminContext(
      api,
      organizationId,
      scope.context.scope,
      signal,
    );
    if (
      context.organization.organizationId !== organizationId ||
      !sameManagementScope(context.scope, scope.context.scope)
    ) {
      return { status: "denied", routeAccess: null };
    }
    return {
      status: "valid",
      routeAccess: {
        foundationEntryAuthorized: true,
        locationMapsAuthorized:
          commercialAccess.dashboardAccess &&
          isActiveExactCompanyLocationContext(context, scope.context.scope),
        commercial: commercialAccess,
      },
    };
  }

  if (scope.authority === "LOCATION_MANAGER") {
    const subscription = await readLocationManagerSubscription(
      api,
      scope.location.locationId,
      signal,
    );
    if (
      scope.location.status !== "ACTIVE" ||
      subscription.locationId !== scope.location.locationId ||
      subscription.organizationId !== scope.organization.organizationId
    ) {
      return { status: "denied", routeAccess: null };
    }
    const commercialAccess = commercialAccessFromSubscription(subscription.subscription);
    if (accessRequirement === "SUBSCRIPTION_READ") {
      return {
        status: "valid",
        routeAccess: {
          foundationEntryAuthorized: false,
          locationMapsAuthorized: true,
          commercial: commercialAccess,
        },
      };
    }
    if (accessRequirement === "LOCATION_MAPS") {
      return {
        status: "valid",
        routeAccess: {
          foundationEntryAuthorized: commercialAccess.dashboardAccess,
          locationMapsAuthorized: true,
          commercial: commercialAccess,
        },
      };
    }
    const commercialRequirement =
      accessRequirement === "FOUNDATION_ENTRY" ? "DASHBOARD" : accessRequirement;
    return allowsDashboardCommercialRequirement(commercialRequirement, commercialAccess)
      ? {
          status: "valid",
          routeAccess: {
            foundationEntryAuthorized: true,
            locationMapsAuthorized: true,
            commercial: commercialAccess,
          },
        }
      : { status: "entitlement", routeAccess: null };
  }

  if (scope.authority === "LOCATION_MANAGER_GRANT_SET") {
    return { status: "denied", routeAccess: null };
  }

  const current = await listActiveSupervisorScopes(api, signal);
  const exact = current.some(
    (candidate) =>
      candidate.membershipId === scope.context.membershipId &&
      candidate.location.locationId === scope.context.location.locationId &&
      candidate.activeShift.shiftId === scope.context.activeShift.shiftId,
  );
  if (
    !exact ||
    (accessRequirement !== "FOUNDATION_ENTRY" &&
      accessRequirement !== "LOCATION_MAPS")
  ) {
    return { status: "denied", routeAccess: null };
  }
  return {
    status: "valid",
    routeAccess: {
      foundationEntryAuthorized: true,
      locationMapsAuthorized: true,
      commercial: noDashboardCommercialAccess,
    },
  };
}
