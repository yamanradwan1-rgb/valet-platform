import type { SelectedDashboardScope } from "../scope";

export interface SelectedScopeState {
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly selectedScope: SelectedDashboardScope | null;
}

export function advanceSelectedScopeState(
  current: SelectedScopeState,
  identityGeneration: number,
  selectedScope: SelectedDashboardScope | null,
): SelectedScopeState {
  return {
    identityGeneration,
    selectionRevision:
      current.identityGeneration === identityGeneration
        ? current.selectionRevision + 1
        : 1,
    selectedScope,
  };
}
