"use client";

import { useEffect, useState } from "react";
import type { ManagementScope } from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  DashboardApiError,
  type DashboardApiErrorKind,
} from "../../lib/api/dashboard-api-error";
import {
  allowsDashboardCommercialRequirement,
  commercialAccessFromSubscription,
  noDashboardCommercialAccess,
  type DashboardRouteAccess,
  type DashboardRouteAccessRequirement,
} from "../../lib/scope/dashboard-commercial-access";
import {
  listActiveSupervisorScopes,
  readCompanyAdminSubscription,
  readLocationManagerSubscription,
  resolveCompanyAdminContext,
} from "../../lib/scope/dashboard-scope";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import type { SelectedDashboardScope } from "../scope";

export type SelectedScopeRevalidationStatus =
  | "checking"
  | "valid"
  | "entitlement"
  | "denied"
  | "error";

export interface SelectedScopeRevalidationState {
  readonly key: string;
  readonly status: SelectedScopeRevalidationStatus;
  readonly errorKind: DashboardApiErrorKind | null;
  readonly routeAccess: DashboardRouteAccess | null;
}

type SettledStatus = Exclude<SelectedScopeRevalidationStatus, "checking" | "error">;
interface SettledResult {
  readonly status: SettledStatus;
  readonly routeAccess: DashboardRouteAccess | null;
}

export function selectedScopeRevalidationKey(
  sessionGeneration: number,
  identityGeneration: number,
  accessRequirement: DashboardRouteAccessRequirement,
  scope: SelectedDashboardScope | null,
): string {
  const prefix = `${sessionGeneration}:${identityGeneration}:${accessRequirement}`;
  if (scope === null) return `${prefix}:none`;
  if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    return `${prefix}:ca-subscription:${scope.organization.organizationId}`;
  }
  if (scope.authority === "COMPANY_ADMIN") {
    const selected = scope.context.scope;
    const suffix =
      selected.kind === "LOCATION"
        ? `location:${selected.locationId}`
        : "all-locations";
    return `${prefix}:ca:${scope.context.organization.organizationId}:${suffix}`;
  }
  if (scope.authority === "LOCATION_MANAGER") {
    return `${prefix}:lm:${scope.organization.organizationId}:${scope.location.locationId}`;
  }
  return [
    prefix,
    "sup",
    scope.context.organization.organizationId,
    scope.context.membershipId,
    scope.context.location.locationId,
    scope.context.activeShift.shiftId,
  ].join(":");
}

export function classifyScopeRevalidationFailure(
  reason: unknown,
): Pick<SelectedScopeRevalidationState, "status" | "errorKind"> {
  if (!(reason instanceof DashboardApiError)) {
    return { status: "error", errorKind: null };
  }
  if (reason.kind === "entitlement") {
    return { status: "entitlement", errorKind: reason.kind };
  }
  if (
    reason.kind === "auth" ||
    reason.kind === "mfa" ||
    reason.kind === "authorization"
  ) {
    return { status: "denied", errorKind: reason.kind };
  }
  return { status: "error", errorKind: reason.kind };
}

export async function revalidateSelectedScope(
  api: DashboardApiClient,
  scope: SelectedDashboardScope,
  accessRequirement: DashboardRouteAccessRequirement,
  signal?: AbortSignal,
): Promise<SettledResult> {
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
        routeAccess: { foundationEntryAuthorized: false, commercial: commercialAccess },
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
      routeAccess: { foundationEntryAuthorized: true, commercial: commercialAccess },
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
        routeAccess: { foundationEntryAuthorized: false, commercial: commercialAccess },
      };
    }
    const commercialRequirement =
      accessRequirement === "FOUNDATION_ENTRY" ? "DASHBOARD" : accessRequirement;
    return allowsDashboardCommercialRequirement(commercialRequirement, commercialAccess)
      ? {
          status: "valid",
          routeAccess: { foundationEntryAuthorized: true, commercial: commercialAccess },
        }
      : { status: "entitlement", routeAccess: null };
  }

  const current = await listActiveSupervisorScopes(api, signal);
  const exact = current.some(
    (candidate) =>
      candidate.membershipId === scope.context.membershipId &&
      candidate.location.locationId === scope.context.location.locationId &&
      candidate.activeShift.shiftId === scope.context.activeShift.shiftId,
  );
  if (!exact || accessRequirement !== "FOUNDATION_ENTRY") {
    return { status: "denied", routeAccess: null };
  }
  return {
    status: "valid",
    routeAccess: {
      foundationEntryAuthorized: true,
      commercial: noDashboardCommercialAccess,
    },
  };
}

function sameManagementScope(
  current: ManagementScope,
  expected: ManagementScope,
): boolean {
  if (current.kind !== expected.kind) return false;
  return current.kind === "ALL_LOCATIONS" ||
    (expected.kind === "LOCATION" && current.locationId === expected.locationId);
}

export function useSelectedScopeRevalidation(input: {
  readonly api: DashboardApiClient;
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly onDenied?: () => void;
  readonly selectedScope: SelectedDashboardScope | null;
}): SelectedScopeRevalidationState {
  const {
    api,
    accessRequirement,
    identityGeneration,
    onDenied,
    selectedScope,
    sessionGeneration,
  } = input;
  const [guard] = useState(() => new ScopeGenerationGuard());
  const key = selectedScopeRevalidationKey(
    sessionGeneration,
    identityGeneration,
    accessRequirement,
    selectedScope,
  );
  const [settled, setSettled] = useState<SelectedScopeRevalidationState>({
    key,
    status: "checking",
    errorKind: null,
    routeAccess: null,
  });

  useEffect(() => {
    const ticket = guard.begin();
    let disposed = false;
    void Promise.resolve().then(async () => {
      if (disposed || !guard.isCurrent(ticket)) return;
      if (selectedScope === null) {
        setSettled({ key, status: "denied", errorKind: null, routeAccess: null });
        return;
      }
      try {
        const result = await revalidateSelectedScope(
          api,
          selectedScope,
          accessRequirement,
          ticket.signal,
        );
        if (!disposed && guard.isCurrent(ticket)) {
          setSettled({
            key,
            status: result.status,
            errorKind: result.status === "entitlement" ? "entitlement" : null,
            routeAccess: result.routeAccess,
          });
          if (result.status === "denied") onDenied?.();
        }
      } catch (reason: unknown) {
        if (!disposed && guard.isCurrent(ticket)) {
          const failure = classifyScopeRevalidationFailure(reason);
          setSettled({ key, ...failure, routeAccess: null });
          if (failure.status === "denied") onDenied?.();
        }
      }
    });
    return () => {
      disposed = true;
      guard.invalidate();
    };
  }, [
    api,
    accessRequirement,
    guard,
    identityGeneration,
    key,
    onDenied,
    selectedScope,
    sessionGeneration,
  ]);

  return settled.key === key
    ? settled
    : { key, status: "checking", errorKind: null, routeAccess: null };
}
