import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  commercialAccessFromSubscription,
  noDashboardCommercialAccess,
  type DashboardCommercialAccess,
} from "../../lib/scope/dashboard-commercial-access";
import {
  listActiveSupervisorScopes,
  readCompanyAdminSubscription,
  readLocationManagerSubscription,
  resolveCompanyAdminContext,
} from "../../lib/scope/dashboard-scope";
import type { SelectedDashboardScope } from "../scope";
import {
  isActiveExactCompanyLocationContext,
  sameManagementScope,
} from "./selected-scope-revalidation-policy";
import { shareSelectedScopeBaseRequest } from "./selected-scope-base-request";

export type SelectedScopeBaseKind =
  | "FEATURE_ONLY"
  | "MANAGEMENT"
  | "SUBSCRIPTION_ONLY"
  | "SUPERVISOR";

export interface SelectedScopeBaseFacts {
  readonly commercial: DashboardCommercialAccess;
  readonly foundationEntryEligible: boolean;
  readonly kind: SelectedScopeBaseKind;
  readonly locationMapsEligible: boolean;
}

export type SelectedScopeBaseResolution =
  | { readonly status: "valid"; readonly facts: SelectedScopeBaseFacts }
  | { readonly status: "denied"; readonly facts: null };

interface BaseResolutionOptions {
  readonly includeCompanyContext: boolean;
}

const featureOnlyFacts: SelectedScopeBaseFacts = {
  commercial: noDashboardCommercialAccess,
  foundationEntryEligible: false,
  kind: "FEATURE_ONLY",
  locationMapsEligible: false,
};

export function resolveSelectedScopeBaseAuthority(
  api: DashboardApiClient,
  scope: SelectedDashboardScope,
  options: BaseResolutionOptions,
  signal?: AbortSignal,
  sharedRequestKey?: string,
): Promise<SelectedScopeBaseResolution> {
  if (sharedRequestKey === undefined) {
    return resolveSelectedScopeBaseAuthorityOnce(api, scope, options, signal);
  }
  const key = [
    sharedRequestKey,
    scope.authority === "COMPANY_ADMIN"
      ? options.includeCompanyContext ? "company-context" : "company-subscription"
      : "canonical",
  ].join(":");
  return shareSelectedScopeBaseRequest(
    api,
    key,
    (sharedSignal) =>
      resolveSelectedScopeBaseAuthorityOnce(api, scope, options, sharedSignal),
    signal,
  );
}

async function resolveSelectedScopeBaseAuthorityOnce(
  api: DashboardApiClient,
  scope: SelectedDashboardScope,
  options: BaseResolutionOptions,
  signal?: AbortSignal,
): Promise<SelectedScopeBaseResolution> {
  if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    const subscription = await readCompanyAdminSubscription(
      api,
      scope.organization.organizationId,
      signal,
    );
    if (subscription.organizationId !== scope.organization.organizationId) {
      return denied();
    }
    return {
      status: "valid",
      facts: {
        commercial: commercialAccessFromSubscription(subscription.subscription),
        foundationEntryEligible: false,
        kind: "SUBSCRIPTION_ONLY",
        locationMapsEligible: false,
      },
    };
  }

  if (scope.authority === "COMPANY_ADMIN") {
    return companyAdminBase(api, scope, options.includeCompanyContext, signal);
  }

  if (scope.authority === "LOCATION_MANAGER_GRANT_SET") {
    return { status: "valid", facts: featureOnlyFacts };
  }

  if (scope.authority === "LOCATION_MANAGER") {
    if (scope.location.status !== "ACTIVE") {
      return { status: "valid", facts: featureOnlyFacts };
    }
    const subscription = await readLocationManagerSubscription(
      api,
      scope.location.locationId,
      signal,
    );
    if (
      subscription.locationId !== scope.location.locationId ||
      subscription.organizationId !== scope.organization.organizationId
    ) {
      return denied();
    }
    const commercial = commercialAccessFromSubscription(subscription.subscription);
    return {
      status: "valid",
      facts: {
        commercial,
        foundationEntryEligible: commercial.dashboardAccess,
        kind: "MANAGEMENT",
        locationMapsEligible: true,
      },
    };
  }

  const current = await listActiveSupervisorScopes(api, signal);
  const exact = current.some(
    (candidate) =>
      candidate.membershipId === scope.context.membershipId &&
      candidate.organization.organizationId ===
        scope.context.organization.organizationId &&
      candidate.location.locationId === scope.context.location.locationId &&
      candidate.activeShift.locationId === scope.context.activeShift.locationId &&
      candidate.activeShift.shiftId === scope.context.activeShift.shiftId,
  );
  return exact
    ? {
        status: "valid",
        facts: {
          commercial: noDashboardCommercialAccess,
          foundationEntryEligible: true,
          kind: "SUPERVISOR",
          locationMapsEligible: true,
        },
      }
    : denied();
}

async function companyAdminBase(
  api: DashboardApiClient,
  scope: Extract<SelectedDashboardScope, { authority: "COMPANY_ADMIN" }>,
  includeContext: boolean,
  signal?: AbortSignal,
): Promise<SelectedScopeBaseResolution> {
  const organizationId = scope.context.organization.organizationId;
  const subscription = await readCompanyAdminSubscription(api, organizationId, signal);
  if (subscription.organizationId !== organizationId) return denied();
  const commercial = commercialAccessFromSubscription(subscription.subscription);
  if (!includeContext || !commercial.dashboardAccess) {
    return {
      status: "valid",
      facts: {
        commercial,
        foundationEntryEligible: false,
        kind: "MANAGEMENT",
        locationMapsEligible: false,
      },
    };
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
    return denied();
  }
  return {
    status: "valid",
    facts: {
      commercial,
      foundationEntryEligible: true,
      kind: "MANAGEMENT",
      locationMapsEligible: isActiveExactCompanyLocationContext(
        context,
        scope.context.scope,
      ),
    },
  };
}

function denied(): SelectedScopeBaseResolution {
  return { status: "denied", facts: null };
}
