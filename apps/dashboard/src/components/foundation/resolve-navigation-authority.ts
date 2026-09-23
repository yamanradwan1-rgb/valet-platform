import type { DashboardFeatureAuthorityFeature } from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  candidateNavigationRegistrations,
} from "../../lib/navigation/navigation-registry";
import {
  navigationFeatureForRequirement,
  noNavigationAuthority,
  type NavigationAuthority,
  type NavigationFeatureEligibility,
} from "../../lib/navigation/navigation-authority";
import type { DashboardNavigationRegistration } from "../../lib/navigation/navigation-types";
import { noDashboardCommercialAccess } from "../../lib/scope/dashboard-commercial-access";
import { readDashboardFeatureAuthority } from "../../lib/scope/dashboard-scope";
import type { SelectedDashboardScope } from "../scope";
import {
  dashboardFeatureTarget,
  dashboardFeatureTargetKey,
  matchesDashboardFeatureAuthority,
  type DashboardFeatureTarget,
} from "./dashboard-feature-target";
import { selectedScopePresentation } from "./scope-presentation";
import {
  resolveSelectedScopeBaseAuthority,
  type SelectedScopeBaseFacts,
} from "./selected-scope-base-authority";

export async function resolveNavigationAuthority(input: {
  readonly api: DashboardApiClient;
  readonly baseRequestKey?: string;
  readonly registrations: readonly DashboardNavigationRegistration[];
  readonly selectedScope: SelectedDashboardScope;
  readonly signal?: AbortSignal;
}): Promise<NavigationAuthority> {
  const { api, baseRequestKey, registrations, selectedScope, signal } = input;
  const context = selectedScopePresentation(selectedScope).navigation;
  const targets = requiredFeatureTargets(registrations, context, selectedScope);
  const baseResolution = await resolveSelectedScopeBaseAuthority(
    api,
    selectedScope,
    { includeCompanyContext: true },
    signal,
    baseRequestKey,
  );
  if (baseResolution.status !== "valid") {
    const features = { ...noNavigationAuthority.features };
    for (const target of targets) features[target.feature] = "DENIED";
    return { ...noNavigationAuthority, features };
  }
  const base = baseNavigationAuthority(baseResolution.facts, selectedScope);
  const features: Record<
    DashboardFeatureAuthorityFeature,
    NavigationFeatureEligibility
  > = { ...base.features };
  const probeTargets = targets.filter((target) => {
    if (!target.compatibleBase) return true;
    if (baseResolution.facts.foundationEntryEligible) return true;
    features[target.feature] = "DENIED";
    return false;
  });
  const featureSettlements = await Promise.allSettled(probeTargets.map(async (target) => ({
    authority: await readDashboardFeatureAuthority(
      api,
      {
        feature: target.feature,
        organizationId: target.organizationId,
        ...(target.locationId === undefined
          ? {}
          : { locationId: target.locationId }),
      },
      signal,
    ),
    target,
  })));

  probeTargets.forEach((target, index) => {
    const settlement = featureSettlements[index];
    features[target.feature] = featureEligibility(target, settlement);
  });
  return { ...base, features };
}

function requiredFeatureTargets(
  registrations: readonly DashboardNavigationRegistration[],
  context: ReturnType<typeof selectedScopePresentation>["navigation"],
  selectedScope: SelectedDashboardScope,
): readonly DashboardFeatureTarget[] {
  const targets = new Map<string, DashboardFeatureTarget>();
  for (const registration of candidateNavigationRegistrations(registrations, context)) {
    const feature = navigationFeatureForRequirement(registration.accessRequirement);
    if (feature === null) continue;
    const target = dashboardFeatureTarget(selectedScope, feature);
    if (target !== null) targets.set(dashboardFeatureTargetKey(target), target);
  }
  return [...targets.values()];
}

function baseNavigationAuthority(
  facts: SelectedScopeBaseFacts,
  selectedScope: SelectedDashboardScope,
): NavigationAuthority {
  if (facts.kind === "FEATURE_ONLY") return noNavigationAuthority;
  if (facts.kind === "SUBSCRIPTION_ONLY") {
    return {
      ...noNavigationAuthority,
      commercial: {
        basicBranding: false,
        dashboardAccess: false,
        subscriptionRead: facts.commercial.subscriptionRead,
      },
    };
  }
  return navigationAuthorityFromFacts(facts, selectedScope);
}

function navigationAuthorityFromFacts(
  facts: SelectedScopeBaseFacts,
  selectedScope: SelectedDashboardScope,
): NavigationAuthority {
  return {
    ...noNavigationAuthority,
    commercial:
      facts.kind === "SUPERVISOR"
        ? noDashboardCommercialAccess
        : facts.commercial,
    foundationEntryEligible: facts.foundationEntryEligible,
    locationMapsEligible: facts.locationMapsEligible,
    managementIntelligenceEligible: intelligenceEligible(
      facts,
      selectedScope,
    ),
  };
}

function intelligenceEligible(
  facts: SelectedScopeBaseFacts,
  selectedScope: SelectedDashboardScope,
): boolean {
  if (facts.kind !== "MANAGEMENT" || !facts.commercial.dashboardAccess) {
    return false;
  }
  if (selectedScope.authority === "COMPANY_ADMIN") {
    return selectedScope.context.scope.kind === "ALL_LOCATIONS" ||
      facts.locationMapsEligible;
  }
  return selectedScope.authority === "LOCATION_MANAGER" &&
    facts.locationMapsEligible;
}

function featureEligibility(
  target: DashboardFeatureTarget,
  settlement: PromiseSettledResult<{
    readonly authority: Awaited<ReturnType<typeof readDashboardFeatureAuthority>>;
    readonly target: DashboardFeatureTarget;
  }> | undefined,
): NavigationFeatureEligibility {
  if (settlement?.status !== "fulfilled") {
    return classifyFeatureFailure(settlement?.reason);
  }
  if (!matchesDashboardFeatureAuthority(target, settlement.value.authority)) {
    return "DENIED";
  }
  return "ELIGIBLE";
}

function classifyFeatureFailure(reason: unknown): NavigationFeatureEligibility {
  if (!(reason instanceof DashboardApiError)) return "UNAVAILABLE";
  return reason.kind === "auth" ||
    reason.kind === "mfa" ||
    reason.kind === "authorization" ||
    reason.kind === "entitlement"
    ? "DENIED"
    : "UNAVAILABLE";
}
