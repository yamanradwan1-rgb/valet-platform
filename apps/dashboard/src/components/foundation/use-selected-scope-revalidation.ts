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
  supervisorDashboardCommercialAccess,
  type DashboardCommercialAccess,
  type DashboardCommercialRequirement,
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
  readonly commercialAccess: DashboardCommercialAccess | null;
}

type SettledStatus = Exclude<SelectedScopeRevalidationStatus, "checking" | "error">;
interface SettledResult {
  readonly status: SettledStatus;
  readonly commercialAccess: DashboardCommercialAccess | null;
}

export function selectedScopeRevalidationKey(
  sessionGeneration: number,
  identityGeneration: number,
  commercialRequirement: DashboardCommercialRequirement,
  scope: SelectedDashboardScope | null,
): string {
  const prefix = `${sessionGeneration}:${identityGeneration}:${commercialRequirement}`;
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
  commercialRequirement: DashboardCommercialRequirement,
  signal?: AbortSignal,
): Promise<SettledResult> {
  if (scope.authority === "COMPANY_ADMIN_SUBSCRIPTION") {
    if (commercialRequirement !== "SUBSCRIPTION_READ") {
      return { status: "denied", commercialAccess: null };
    }
    const subscription = await readCompanyAdminSubscription(
      api,
      scope.organization.organizationId,
      signal,
    );
    if (subscription.organizationId !== scope.organization.organizationId) {
      return { status: "denied", commercialAccess: null };
    }
    return {
      status: "valid",
      commercialAccess: commercialAccessFromSubscription(subscription.subscription),
    };
  }

  if (scope.authority === "COMPANY_ADMIN") {
    const organizationId = scope.context.organization.organizationId;
    const subscription = await readCompanyAdminSubscription(api, organizationId, signal);
    if (subscription.organizationId !== organizationId) {
      return { status: "denied", commercialAccess: null };
    }
    const commercialAccess = commercialAccessFromSubscription(subscription.subscription);
    if (!allowsDashboardCommercialRequirement(commercialRequirement, commercialAccess)) {
      return { status: "entitlement", commercialAccess: null };
    }
    if (commercialRequirement === "SUBSCRIPTION_READ") {
      return { status: "valid", commercialAccess };
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
      return { status: "denied", commercialAccess: null };
    }
    return { status: "valid", commercialAccess };
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
      return { status: "denied", commercialAccess: null };
    }
    const commercialAccess = commercialAccessFromSubscription(subscription.subscription);
    return allowsDashboardCommercialRequirement(commercialRequirement, commercialAccess)
      ? { status: "valid", commercialAccess }
      : { status: "entitlement", commercialAccess: null };
  }

  if (commercialRequirement !== "DASHBOARD") {
    return { status: "denied", commercialAccess: null };
  }
  const current = await listActiveSupervisorScopes(api, signal);
  const exact = current.some(
    (candidate) =>
      candidate.membershipId === scope.context.membershipId &&
      candidate.location.locationId === scope.context.location.locationId &&
      candidate.activeShift.shiftId === scope.context.activeShift.shiftId,
  );
  return exact
    ? { status: "valid", commercialAccess: supervisorDashboardCommercialAccess }
    : { status: "denied", commercialAccess: null };
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
  readonly commercialRequirement: DashboardCommercialRequirement;
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly onDenied?: () => void;
  readonly selectedScope: SelectedDashboardScope | null;
}): SelectedScopeRevalidationState {
  const {
    api,
    commercialRequirement,
    identityGeneration,
    onDenied,
    selectedScope,
    sessionGeneration,
  } = input;
  const [guard] = useState(() => new ScopeGenerationGuard());
  const key = selectedScopeRevalidationKey(
    sessionGeneration,
    identityGeneration,
    commercialRequirement,
    selectedScope,
  );
  const [settled, setSettled] = useState<SelectedScopeRevalidationState>({
    key,
    status: "checking",
    errorKind: null,
    commercialAccess: null,
  });

  useEffect(() => {
    const ticket = guard.begin();
    let disposed = false;
    void Promise.resolve().then(async () => {
      if (disposed || !guard.isCurrent(ticket)) return;
      if (selectedScope === null) {
        setSettled({ key, status: "denied", errorKind: null, commercialAccess: null });
        return;
      }
      try {
        const result = await revalidateSelectedScope(
          api,
          selectedScope,
          commercialRequirement,
          ticket.signal,
        );
        if (!disposed && guard.isCurrent(ticket)) {
          setSettled({
            key,
            status: result.status,
            errorKind: result.status === "entitlement" ? "entitlement" : null,
            commercialAccess: result.commercialAccess,
          });
          if (result.status === "denied") onDenied?.();
        }
      } catch (reason: unknown) {
        if (!disposed && guard.isCurrent(ticket)) {
          const failure = classifyScopeRevalidationFailure(reason);
          setSettled({ key, ...failure, commercialAccess: null });
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
    commercialRequirement,
    guard,
    identityGeneration,
    key,
    onDenied,
    selectedScope,
    sessionGeneration,
  ]);

  return settled.key === key
    ? settled
    : { key, status: "checking", errorKind: null, commercialAccess: null };
}
