"use client";

import { useEffect, useState } from "react";
import type { ManagementScope } from "@valet/contracts";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import {
  DashboardApiError,
  type DashboardApiErrorKind,
} from "../../lib/api/dashboard-api-error";
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
}

type SettledStatus = Exclude<SelectedScopeRevalidationStatus, "checking" | "error">;

export function selectedScopeRevalidationKey(
  sessionGeneration: number,
  identityGeneration: number,
  scope: SelectedDashboardScope | null,
): string {
  if (scope === null) return `${sessionGeneration}:${identityGeneration}:none`;
  if (scope.authority === "COMPANY_ADMIN") {
    const selected = scope.context.scope;
    const suffix =
      selected.kind === "LOCATION"
        ? `location:${selected.locationId}`
        : "all-locations";
    return `${sessionGeneration}:${identityGeneration}:ca:${scope.context.organization.organizationId}:${suffix}`;
  }
  if (scope.authority === "LOCATION_MANAGER") {
    return `${sessionGeneration}:${identityGeneration}:lm:${scope.organization.organizationId}:${scope.location.locationId}`;
  }
  return [
    sessionGeneration,
    identityGeneration,
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
  signal?: AbortSignal,
): Promise<SettledStatus> {
  if (scope.authority === "COMPANY_ADMIN") {
    const organizationId = scope.context.organization.organizationId;
    const subscription = await readCompanyAdminSubscription(api, organizationId, signal);
    if (subscription.organizationId !== organizationId) return "denied";
    if (subscription.subscription?.entitlements.dashboardAccess !== true) {
      return "entitlement";
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
      return "denied";
    }
    return "valid";
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
      return "denied";
    }
    return subscription.subscription?.entitlements.dashboardAccess === true
      ? "valid"
      : "entitlement";
  }

  const current = await listActiveSupervisorScopes(api, signal);
  const exact = current.some(
    (candidate) =>
      candidate.membershipId === scope.context.membershipId &&
      candidate.location.locationId === scope.context.location.locationId &&
      candidate.activeShift.shiftId === scope.context.activeShift.shiftId,
  );
  return exact ? "valid" : "denied";
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
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly onDenied?: () => void;
  readonly selectedScope: SelectedDashboardScope | null;
}): SelectedScopeRevalidationState {
  const { api, identityGeneration, onDenied, selectedScope, sessionGeneration } = input;
  const [guard] = useState(() => new ScopeGenerationGuard());
  const key = selectedScopeRevalidationKey(
    sessionGeneration,
    identityGeneration,
    selectedScope,
  );
  const [settled, setSettled] = useState<SelectedScopeRevalidationState>({
    key,
    status: "checking",
    errorKind: null,
  });

  useEffect(() => {
    const ticket = guard.begin();
    let disposed = false;
    void Promise.resolve().then(async () => {
      if (disposed || !guard.isCurrent(ticket)) return;
      if (selectedScope === null) {
        setSettled({ key, status: "denied", errorKind: null });
        return;
      }
      try {
        const status = await revalidateSelectedScope(api, selectedScope, ticket.signal);
        if (!disposed && guard.isCurrent(ticket)) {
          setSettled({
            key,
            status,
            errorKind: status === "entitlement" ? "entitlement" : null,
          });
          if (status === "denied") onDenied?.();
        }
      } catch (reason: unknown) {
        if (!disposed && guard.isCurrent(ticket)) {
          const failure = classifyScopeRevalidationFailure(reason);
          setSettled({ key, ...failure });
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
    guard,
    identityGeneration,
    key,
    onDenied,
    selectedScope,
    sessionGeneration,
  ]);

  return settled.key === key
    ? settled
    : { key, status: "checking", errorKind: null };
}
