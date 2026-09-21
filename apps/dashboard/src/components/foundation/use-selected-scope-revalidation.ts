"use client";

import { useEffect, useState } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { DashboardApiErrorKind } from "../../lib/api/dashboard-api-error";
import {
  type DashboardRouteAccess,
  type DashboardRouteAccessRequirement,
} from "../../lib/scope/dashboard-commercial-access";
import { ScopeGenerationGuard } from "../../lib/scope/scope-generation";
import type { SelectedDashboardScope } from "../scope";
import {
  classifyScopeRevalidationFailure,
  selectedScopeRevalidationKey,
} from "./selected-scope-revalidation-policy";
import { revalidateSelectedScope } from "./revalidate-selected-scope";

export {
  classifyScopeRevalidationFailure,
  selectedScopeRevalidationKey,
} from "./selected-scope-revalidation-policy";
export { revalidateSelectedScope } from "./revalidate-selected-scope";

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
