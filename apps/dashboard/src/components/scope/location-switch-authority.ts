import type { ManagementLocation, ManagementScope } from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  dashboardNavigationRegistrations,
  resolveNavigation,
  type DashboardNavigationItem,
} from "../../lib/navigation";
import {
  commercialAccessFromSubscription,
  noDashboardCommercialAccess,
  type DashboardRouteAccessRequirement,
} from "../../lib/scope/dashboard-commercial-access";
import {
  listLocationManagerLocations,
  readCompanyAdminSubscription,
  readLocationManagerSubscription,
  resolveCompanyAdminContext,
} from "../../lib/scope/dashboard-scope";
import { resolveNavigationAuthority } from "../foundation/resolve-navigation-authority";
import type { SelectedScopeBaseResolution } from "../foundation/selected-scope-base-authority";
import {
  isActiveExactCompanyLocationContext,
  sameManagementScope,
} from "../foundation/selected-scope-revalidation-policy";
import { selectedScopePresentation } from "../foundation/scope-presentation";
import {
  isCurrentPathAuthorized,
  navigationForLocationStatus,
  safeLocationSwitchLanding,
} from "./location-switch-policy";
import type { SelectedDashboardScope } from "./scope-entry-types";

export type SwitchableDashboardScope = Extract<
  SelectedDashboardScope,
  { authority: "COMPANY_ADMIN" | "LOCATION_MANAGER" }
>;

export type LocationSwitchSourceScope = Extract<
  SelectedDashboardScope,
  {
    authority:
      "COMPANY_ADMIN" | "LOCATION_MANAGER" | "LOCATION_MANAGER_GRANT_SET";
  }
>;

export type LocationSwitchCandidate =
  | { readonly kind: "ALL_LOCATIONS" }
  | {
      readonly kind: "LOCATION";
      readonly location: ManagementLocation;
      readonly proofCursor?: string;
    };

export type LocationSwitchProof =
  | {
      readonly destination: string | null;
      readonly kind: "READY";
      readonly navigation: readonly DashboardNavigationItem[];
      readonly scope: SwitchableDashboardScope;
    }
  | { readonly kind: "DENIED" };

interface CandidateAuthorityProof {
  readonly baseResolution: SelectedScopeBaseResolution;
  readonly scope: SwitchableDashboardScope;
}

export interface LocationSwitchAuthorityDependencies {
  readonly listLocationManagerLocations: typeof listLocationManagerLocations;
  readonly readCompanyAdminSubscription: typeof readCompanyAdminSubscription;
  readonly readLocationManagerSubscription: typeof readLocationManagerSubscription;
  readonly resolveCompanyAdminContext: typeof resolveCompanyAdminContext;
  readonly resolveNavigationAuthority: typeof resolveNavigationAuthority;
}

const productionDependencies: LocationSwitchAuthorityDependencies = {
  listLocationManagerLocations,
  readCompanyAdminSubscription,
  readLocationManagerSubscription,
  resolveCompanyAdminContext,
  resolveNavigationAuthority,
};

export async function proveLocationSwitchCandidate(
  input: {
    readonly accessRequirement: DashboardRouteAccessRequirement;
    readonly api: DashboardApiClient;
    readonly candidate: LocationSwitchCandidate;
    readonly currentPath: string;
    readonly currentScope: LocationSwitchSourceScope;
    readonly preserveIndependentRoute?: boolean;
    readonly requestKey: string;
    readonly signal: AbortSignal;
  },
  dependencies: LocationSwitchAuthorityDependencies = productionDependencies,
): Promise<LocationSwitchProof> {
  const proof = await proveCandidateAuthority(input, dependencies);
  if (proof === null) return { kind: "DENIED" };
  const authority = await dependencies.resolveNavigationAuthority({
    api: input.api,
    baseRequestKey: input.requestKey,
    baseResolution: proof.baseResolution,
    registrations: dashboardNavigationRegistrations,
    selectedScope: proof.scope,
    signal: input.signal,
  });
  const navigation = navigationForLocationStatus(
    resolveNavigation(
      dashboardNavigationRegistrations,
      selectedScopePresentation(proof.scope).navigation,
      "en",
      authority,
    ),
    selectedLocationStatus(proof.scope),
  );
  if (
    input.preserveIndependentRoute &&
    proof.baseResolution.status === "valid"
  ) {
    return {
      destination: null,
      kind: "READY",
      navigation,
      scope: proof.scope,
    };
  }
  if (isCurrentPathAuthorized(input.currentPath, navigation)) {
    return {
      destination: null,
      kind: "READY",
      navigation,
      scope: proof.scope,
    };
  }
  const destination = safeLocationSwitchLanding(navigation);
  return destination === null
    ? { kind: "DENIED" }
    : { destination, kind: "READY", navigation, scope: proof.scope };
}

async function proveCandidateAuthority(
  input: {
    readonly api: DashboardApiClient;
    readonly candidate: LocationSwitchCandidate;
    readonly currentScope: LocationSwitchSourceScope;
    readonly signal: AbortSignal;
  },
  dependencies: LocationSwitchAuthorityDependencies,
): Promise<CandidateAuthorityProof | null> {
  if (input.currentScope.authority === "COMPANY_ADMIN") {
    return proveCompanyAdminCandidate(
      { ...input, currentScope: input.currentScope },
      dependencies,
    );
  }
  return proveLocationManagerCandidate(
    { ...input, currentScope: input.currentScope },
    dependencies,
  );
}

async function proveCompanyAdminCandidate(
  input: {
    readonly api: DashboardApiClient;
    readonly candidate: LocationSwitchCandidate;
    readonly currentScope: Extract<
      SwitchableDashboardScope,
      { authority: "COMPANY_ADMIN" }
    >;
    readonly signal: AbortSignal;
  },
  dependencies: LocationSwitchAuthorityDependencies,
): Promise<CandidateAuthorityProof | null> {
  const organizationId = input.currentScope.context.organization.organizationId;
  const target: ManagementScope =
    input.candidate.kind === "ALL_LOCATIONS"
      ? { kind: "ALL_LOCATIONS" }
      : { kind: "LOCATION", locationId: input.candidate.location.locationId };
  const [context, subscription] = await Promise.all([
    dependencies.resolveCompanyAdminContext(
      input.api,
      organizationId,
      target,
      input.signal,
    ),
    dependencies.readCompanyAdminSubscription(
      input.api,
      organizationId,
      input.signal,
    ),
  ]);
  if (
    context.organization.organizationId !== organizationId ||
    subscription.organizationId !== organizationId ||
    !sameManagementScope(context.scope, target)
  )
    return null;
  const commercial = commercialAccessFromSubscription(
    subscription.subscription,
  );
  const scope = { authority: "COMPANY_ADMIN" as const, context };
  return {
    scope,
    baseResolution: {
      status: "valid",
      facts: {
        commercial,
        foundationEntryEligible: commercial.dashboardAccess,
        kind: "MANAGEMENT",
        locationMapsEligible:
          commercial.dashboardAccess &&
          isActiveExactCompanyLocationContext(context, target),
      },
    },
  };
}

async function proveLocationManagerCandidate(
  input: {
    readonly api: DashboardApiClient;
    readonly candidate: LocationSwitchCandidate;
    readonly currentScope: Extract<
      LocationSwitchSourceScope,
      { authority: "LOCATION_MANAGER" | "LOCATION_MANAGER_GRANT_SET" }
    >;
    readonly signal: AbortSignal;
  },
  dependencies: LocationSwitchAuthorityDependencies,
): Promise<CandidateAuthorityProof | null> {
  if (input.candidate.kind !== "LOCATION") return null;
  const candidate = input.candidate;
  const organization = input.currentScope.organization;
  const page = await dependencies.listLocationManagerLocations(
    input.api,
    organization.organizationId,
    candidate.proofCursor === undefined
      ? {}
      : { cursor: candidate.proofCursor },
    input.signal,
  );
  const location = page.items.find(
    (item) => item.locationId === candidate.location.locationId,
  );
  if (location === undefined) return null;
  const scope = {
    authority: "LOCATION_MANAGER" as const,
    organization,
    location,
  };
  if (location.status === "INACTIVE") {
    return {
      scope,
      baseResolution: {
        status: "valid",
        facts: {
          commercial: noDashboardCommercialAccess,
          foundationEntryEligible: false,
          kind: "FEATURE_ONLY",
          locationMapsEligible: false,
        },
      },
    };
  }
  const subscription = await dependencies.readLocationManagerSubscription(
    input.api,
    location.locationId,
    input.signal,
  );
  if (
    subscription.organizationId !== organization.organizationId ||
    subscription.locationId !== location.locationId
  )
    return null;
  const commercial = commercialAccessFromSubscription(
    subscription.subscription,
  );
  return {
    scope,
    baseResolution: {
      status: "valid",
      facts: {
        commercial,
        foundationEntryEligible: commercial.dashboardAccess,
        kind: "MANAGEMENT",
        locationMapsEligible: true,
      },
    },
  };
}

function selectedLocationStatus(
  scope: SwitchableDashboardScope,
): ManagementLocation["status"] | null {
  if (scope.authority === "LOCATION_MANAGER") return scope.location.status;
  return scope.context.selectedLocation?.status ?? null;
}
