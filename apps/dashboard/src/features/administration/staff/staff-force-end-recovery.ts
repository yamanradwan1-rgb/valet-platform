import type { ProtectedDashboardContextValue } from "../../../components/foundation/protected-dashboard-context";
import { selectedScopeAuthorityKey } from "../../../components/foundation/selected-scope-revalidation-policy";

export interface ForceEndRecovery {
  readonly scope: string;
  readonly sessionGeneration: number;
  readonly shiftId: string;
  readonly reason: string;
  readonly operationId: string;
}

export function forceEndRecoveryScope(
  dashboard: ProtectedDashboardContextValue,
) {
  return JSON.stringify([
    dashboard.identityGeneration,
    dashboard.selectionRevision,
    selectedScopeAuthorityKey(dashboard.selectedScope),
  ]);
}

// Single-use volatile handoff for a rejected POST's explicit auth-refresh retry.
// It is never a cache, and never restores identity before a new authorized GET.
let recovery: ForceEndRecovery | null = null;
const listeners = new Set<() => void>();
export function subscribeForceEndRecovery(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function rememberForceEndRecovery(value: ForceEndRecovery) {
  recovery = value;
  for (const listener of listeners) listener();
}
export function readForceEndRecovery(
  dashboard: ProtectedDashboardContextValue,
) {
  if (
    recovery?.scope !== forceEndRecoveryScope(dashboard) ||
    recovery.sessionGeneration !== dashboard.sessionGeneration
  ) {
    recovery = null;
  }
  return recovery;
}
export function clearForceEndRecovery(value: ForceEndRecovery | null) {
  if (recovery === value) recovery = null;
}
