"use client";

import { useEffect, useState } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { DashboardApiErrorKind } from "../../lib/api/dashboard-api-error";
import {
  type DashboardRouteAccessRequirement,
  type ProtectedRouteAuthority,
} from "../../lib/scope/dashboard-commercial-access";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import type { SelectedScopeEpoch } from "./selected-scope-state";
import type { SelectedDashboardScope } from "../scope";
import { dashboardFeatureTarget } from "./dashboard-feature-target";
import {
  classifyScopeRevalidationFailure,
  selectedScopeBaseRequestKey,
  selectedScopeRevalidationKey,
} from "./selected-scope-revalidation-policy";
import { revalidateSelectedScope } from "./revalidate-selected-scope";

export {
  classifyScopeRevalidationFailure,
  selectedScopeRevalidationKey,
} from "./selected-scope-revalidation-policy";
export { revalidateSelectedScope } from "./revalidate-selected-scope";

export type SelectedScopeRevalidationStatus =
  "checking" | "valid" | "entitlement" | "denied" | "error";

export interface SelectedScopeRevalidationState {
  readonly key: string;
  readonly status: SelectedScopeRevalidationStatus;
  readonly errorKind: DashboardApiErrorKind | null;
  readonly routeAccess: ProtectedRouteAuthority | null;
}

export type SelectedScopeDenialKind = "ROUTE_DENIED" | "SELECTED_SCOPE_INVALID";

export function useSelectedScopeRevalidation(input: {
  readonly api: DashboardApiClient;
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
  readonly onDenied?: (
    epoch: SelectedScopeEpoch,
    kind: SelectedScopeDenialKind,
  ) => void;
  readonly selectedScope: SelectedDashboardScope | null;
}): SelectedScopeRevalidationState {
  const {
    api,
    accessRequirement,
    identityGeneration,
    onDenied,
    selectionRevision,
    selectedScope,
    sessionGeneration,
  } = input;
  const [guard] = useState(() => new ScopeGenerationGuard());
  const key = selectedScopeRevalidationKey(
    sessionGeneration,
    identityGeneration,
    selectionRevision,
    accessRequirement,
    selectedScope,
  );
  const baseRequestKey = selectedScopeBaseRequestKey(
    sessionGeneration,
    identityGeneration,
    selectionRevision,
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
        setSettled({
          key,
          status: "denied",
          errorKind: null,
          routeAccess: null,
        });
        return;
      }
      try {
        const result = await revalidateSelectedScope(
          api,
          selectedScope,
          accessRequirement,
          ticket.signal,
          baseRequestKey,
        );
        if (!disposed && guard.isCurrent(ticket)) {
          setSettled({
            key,
            status: result.status,
            errorKind: result.status === "entitlement" ? "entitlement" : null,
            routeAccess: result.routeAccess,
          });
          if (
            result.status === "denied" &&
            onDenied &&
            (result.selectedScopeInvalid === true ||
              (await shouldInvalidateSelectedScopeAfterRouteDenial({
                accessRequirement,
                api,
                baseRequestKey,
                selectedScope,
                signal: ticket.signal,
              }))) &&
            !disposed &&
            guard.isCurrent(ticket)
          ) {
            onDenied(
              { identityGeneration, selectionRevision, sessionGeneration },
              result.selectedScopeInvalid === true
                ? "SELECTED_SCOPE_INVALID"
                : "ROUTE_DENIED",
            );
          }
        }
      } catch (reason: unknown) {
        if (!disposed && guard.isCurrent(ticket)) {
          const failure = classifyScopeRevalidationFailure(reason);
          setSettled({ key, ...failure, routeAccess: null });
          if (
            failure.status === "denied" &&
            onDenied &&
            (await shouldInvalidateSelectedScopeAfterRouteDenial({
              accessRequirement,
              api,
              baseRequestKey,
              reason,
              selectedScope,
              signal: ticket.signal,
            })) &&
            !disposed &&
            guard.isCurrent(ticket)
          ) {
            onDenied(
              { identityGeneration, selectionRevision, sessionGeneration },
              failure.errorKind === "auth" ||
                failure.errorKind === "authorization"
                ? "SELECTED_SCOPE_INVALID"
                : "ROUTE_DENIED",
            );
          }
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
    baseRequestKey,
    guard,
    identityGeneration,
    key,
    onDenied,
    selectionRevision,
    selectedScope,
    sessionGeneration,
  ]);

  return settled.key === key
    ? settled
    : { key, status: "checking", errorKind: null, routeAccess: null };
}

export async function shouldInvalidateSelectedScopeAfterRouteDenial(input: {
  readonly accessRequirement: DashboardRouteAccessRequirement;
  readonly api: DashboardApiClient;
  readonly baseRequestKey?: string;
  readonly reason?: unknown;
  readonly selectedScope: SelectedDashboardScope;
  readonly signal?: AbortSignal;
}): Promise<boolean> {
  const {
    accessRequirement,
    api,
    baseRequestKey,
    reason,
    selectedScope,
    signal,
  } = input;
  if (reason !== undefined) {
    const routeFailure = classifyScopeRevalidationFailure(reason);
    if (routeFailure.errorKind === "mfa") return false;
    if (routeFailure.errorKind === "auth") return true;
    if (
      accessRequirement !== "VISIT_CONTACTS" &&
      accessRequirement !== "MANAGEMENT_AUDIT"
    ) {
      return routeFailure.errorKind === "authorization";
    }
    if (routeFailure.errorKind !== "authorization") return false;
  }
  if (
    accessRequirement !== "VISIT_CONTACTS" &&
    accessRequirement !== "MANAGEMENT_AUDIT"
  ) {
    return true;
  }
  const target = dashboardFeatureTarget(selectedScope, accessRequirement);
  if (target?.compatibleBase !== true) return false;
  try {
    const base = await revalidateSelectedScope(
      api,
      selectedScope,
      "FOUNDATION_ENTRY",
      signal,
      baseRequestKey,
    );
    return base.status === "denied";
  } catch (reason: unknown) {
    const failure = classifyScopeRevalidationFailure(reason);
    return (
      failure.errorKind === "auth" || failure.errorKind === "authorization"
    );
  }
}
