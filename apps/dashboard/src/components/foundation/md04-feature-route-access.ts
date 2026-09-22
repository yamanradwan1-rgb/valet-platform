import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import {
  noDashboardCommercialAccess,
  type ProtectedRouteAuthority,
} from "../../lib/scope/dashboard-commercial-access";
import { readDashboardFeatureAuthority } from "../../lib/scope/dashboard-scope";
import type { SelectedDashboardScope } from "../scope";
import {
  dashboardFeatureTarget,
  matchesDashboardFeatureAuthority,
} from "./dashboard-feature-target";

export type Md04FeatureRequirement = "MANAGEMENT_AUDIT" | "VISIT_CONTACTS";

export interface Md04FeatureRevalidationResult {
  readonly status: "valid" | "entitlement" | "denied";
  readonly routeAccess: ProtectedRouteAuthority | null;
  readonly selectedScopeInvalid?: boolean;
}

type BaseRevalidator = () => Promise<Md04FeatureRevalidationResult>;

const featureOnlyBaseAccess: ProtectedRouteAuthority = {
  commercial: noDashboardCommercialAccess,
  foundationEntryAuthorized: false,
  locationMapsAuthorized: false,
};

export function withMd04FeatureAuthority(
  baseAccess: ProtectedRouteAuthority,
  requirement: Md04FeatureRequirement,
): ProtectedRouteAuthority {
  return {
    ...baseAccess,
    managementAuditAuthorized: requirement === "MANAGEMENT_AUDIT",
    visitContactsAuthorized: requirement === "VISIT_CONTACTS",
  };
}

function featureOnlyAccess(
  requirement: Md04FeatureRequirement,
): ProtectedRouteAuthority {
  return withMd04FeatureAuthority(featureOnlyBaseAccess, requirement);
}

export async function revalidateMd04FeatureAuthority(
  api: DashboardApiClient,
  scope: SelectedDashboardScope,
  requirement: Md04FeatureRequirement,
  revalidateCompatibleBase: BaseRevalidator,
  signal?: AbortSignal,
): Promise<Md04FeatureRevalidationResult> {
  const target = dashboardFeatureTarget(scope, requirement);
  if (target === null) return { status: "denied", routeAccess: null };

  const authority = await readDashboardFeatureAuthority(api, {
    feature: requirement,
    organizationId: target.organizationId,
    ...(target.locationId === undefined ? {} : { locationId: target.locationId }),
  }, signal);
  if (!matchesDashboardFeatureAuthority(target, authority)) {
    return { status: "denied", routeAccess: null };
  }

  if (!target.compatibleBase) {
    return { status: "valid", routeAccess: featureOnlyAccess(requirement) };
  }
  let base: Md04FeatureRevalidationResult;
  try {
    base = await revalidateCompatibleBase();
  } catch (reason: unknown) {
    if (
      reason instanceof DashboardApiError &&
      (reason.kind === "auth" || reason.kind === "authorization")
    ) {
      return {
        status: "denied",
        routeAccess: null,
        selectedScopeInvalid: true,
      };
    }
    throw reason;
  }
  if (base.status !== "valid" || base.routeAccess === null) {
    return base.status === "denied"
      ? { ...base, selectedScopeInvalid: true }
      : base;
  }
  return {
    status: "valid",
    routeAccess: withMd04FeatureAuthority(base.routeAccess, requirement),
  };
}
