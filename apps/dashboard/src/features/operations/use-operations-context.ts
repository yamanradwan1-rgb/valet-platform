"use client";

import { useProtectedDashboard } from "../../components/foundation/protected-dashboard-context";
import { hasExactActiveLocation, operationsScope, operationsScopeKey } from "./operations-scope";

export function useOperationsContext() {
  const dashboard = useProtectedDashboard();
  const scope = operationsScope(dashboard.selectedScope);
  const scopeKey = operationsScopeKey(dashboard);
  return {
    dashboard,
    exactLocation: hasExactActiveLocation(scope),
    scope,
    scopeKey,
  };
}
