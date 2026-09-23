import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  allowsDashboardCommercialRequirement,
  noDashboardCommercialAccess,
  type DashboardRouteAccessRequirement,
  type ProtectedRouteAuthority,
} from "../../lib/scope/dashboard-commercial-access";
import type { SelectedDashboardScope } from "../scope";
import { revalidateMd04FeatureAuthority } from "./md04-feature-route-access";
import {
  resolveSelectedScopeBaseAuthority,
  type SelectedScopeBaseFacts,
} from "./selected-scope-base-authority";

export interface SettledScopeRevalidation {
  readonly status: "valid" | "entitlement" | "denied";
  readonly routeAccess: ProtectedRouteAuthority | null;
  readonly selectedScopeInvalid?: boolean;
}

export async function revalidateSelectedScope(
  api: DashboardApiClient,
  scope: SelectedDashboardScope,
  accessRequirement: DashboardRouteAccessRequirement,
  signal?: AbortSignal,
  sharedBaseRequestKey?: string,
): Promise<SettledScopeRevalidation> {
  if (
    accessRequirement === "VISIT_CONTACTS" ||
    accessRequirement === "MANAGEMENT_AUDIT"
  ) {
    return revalidateMd04FeatureAuthority(
      api,
      scope,
      accessRequirement,
      () => revalidateSelectedScope(
        api,
        scope,
        "FOUNDATION_ENTRY",
        signal,
        sharedBaseRequestKey,
      ),
      signal,
    );
  }
  if (
    scope.authority === "COMPANY_ADMIN_SUBSCRIPTION" &&
    accessRequirement !== "SUBSCRIPTION_READ"
  ) {
    return denied();
  }
  if (scope.authority === "LOCATION_MANAGER_GRANT_SET") return denied();

  const includeCompanyContext =
    scope.authority === "COMPANY_ADMIN" &&
    accessRequirement !== "SUBSCRIPTION_READ" &&
    !(
      accessRequirement === "LOCATION_MAPS" &&
      scope.context.scope.kind !== "LOCATION"
    );
  const base = await resolveSelectedScopeBaseAuthority(
    api,
    scope,
    { includeCompanyContext },
    signal,
    sharedBaseRequestKey,
  );
  if (base.status === "denied") return denied();
  return authorizeProtectedRoute(scope, accessRequirement, base.facts);
}

function authorizeProtectedRoute(
  scope: SelectedDashboardScope,
  requirement: Exclude<
    DashboardRouteAccessRequirement,
    "MANAGEMENT_AUDIT" | "VISIT_CONTACTS"
  >,
  facts: SelectedScopeBaseFacts,
): SettledScopeRevalidation {
  if (facts.kind === "FEATURE_ONLY") return denied();
  if (requirement === "SUBSCRIPTION_READ") {
    if (
      scope.authority === "COMPANY_ADMIN" ||
      scope.authority === "COMPANY_ADMIN_SUBSCRIPTION"
    ) {
      return valid({
        commercial: facts.commercial,
        foundationEntryAuthorized: false,
        locationMapsAuthorized: false,
      });
    }
    if (scope.authority === "LOCATION_MANAGER") {
      return valid({
        commercial: facts.commercial,
        foundationEntryAuthorized: false,
        locationMapsAuthorized: true,
      });
    }
    return denied();
  }

  if (requirement === "LOCATION_MAPS") {
    if (facts.kind === "SUPERVISOR") {
      return valid(supervisorAuthority());
    }
    if (scope.authority === "COMPANY_ADMIN") {
      if (scope.context.scope.kind !== "LOCATION") return denied();
      if (!facts.commercial.dashboardAccess) return entitlement();
      return facts.locationMapsEligible
        ? valid(fullAuthority(facts))
        : denied();
    }
    if (scope.authority === "LOCATION_MANAGER" && facts.kind === "MANAGEMENT") {
      return valid({
        commercial: facts.commercial,
        foundationEntryAuthorized: facts.commercial.dashboardAccess,
        locationMapsAuthorized: true,
      });
    }
    return denied();
  }

  if (requirement === "MANAGEMENT_INTELLIGENCE") {
    if (facts.kind !== "MANAGEMENT") return denied();
    if (!facts.commercial.dashboardAccess) return entitlement();
    if (scope.authority === "COMPANY_ADMIN") {
      const eligible =
        scope.context.scope.kind === "ALL_LOCATIONS" ||
        facts.locationMapsEligible;
      return eligible
        ? valid({
            ...fullAuthority(facts),
            managementIntelligenceAuthorized: true,
          })
        : denied();
    }
    if (scope.authority === "LOCATION_MANAGER" && facts.locationMapsEligible) {
      return valid({
        ...fullAuthority(facts),
        managementIntelligenceAuthorized: true,
      });
    }
    return denied();
  }

  if (facts.kind === "SUPERVISOR") {
    return requirement === "FOUNDATION_ENTRY"
      ? valid(supervisorAuthority())
      : denied();
  }
  if (facts.kind !== "MANAGEMENT") return denied();
  const commercialRequirement =
    requirement === "FOUNDATION_ENTRY" ? "DASHBOARD" : requirement;
  if (
    !allowsDashboardCommercialRequirement(
      commercialRequirement,
      facts.commercial,
    )
  ) {
    return entitlement();
  }
  return facts.foundationEntryEligible
    ? valid(fullAuthority(facts))
    : denied();
}

function fullAuthority(facts: SelectedScopeBaseFacts): ProtectedRouteAuthority {
  return {
    commercial: facts.commercial,
    foundationEntryAuthorized: facts.foundationEntryEligible,
    locationMapsAuthorized: facts.locationMapsEligible,
  };
}

function supervisorAuthority(): ProtectedRouteAuthority {
  return {
    commercial: noDashboardCommercialAccess,
    foundationEntryAuthorized: true,
    locationMapsAuthorized: true,
  };
}

function valid(routeAccess: ProtectedRouteAuthority): SettledScopeRevalidation {
  return { status: "valid", routeAccess };
}

function denied(): SettledScopeRevalidation {
  return { status: "denied", routeAccess: null };
}

function entitlement(): SettledScopeRevalidation {
  return { status: "entitlement", routeAccess: null };
}
