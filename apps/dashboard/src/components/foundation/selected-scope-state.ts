import type { SelectedDashboardScope } from "../scope";

export interface SelectedScopeState {
  readonly identityGeneration: number;
  readonly persistence: "preserve" | "sync";
  readonly restorationStatus: "checking" | "settled";
  readonly selectionRevision: number;
  readonly selectedScope: SelectedDashboardScope | null;
}

export interface SelectedScopeEpoch {
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
}

export function advanceSelectedScopeState(
  current: SelectedScopeState,
  identityGeneration: number,
  selectedScope: SelectedDashboardScope | null,
): SelectedScopeState {
  return {
    identityGeneration,
    persistence: "sync",
    restorationStatus: "settled",
    selectionRevision:
      current.identityGeneration === identityGeneration
        ? current.selectionRevision + 1
        : 1,
    selectedScope,
  };
}

export function initialSelectedScopeState(identityGeneration: number): SelectedScopeState {
  return {
    identityGeneration,
    persistence: "preserve",
    restorationStatus: "checking",
    selectionRevision: 0,
    selectedScope: null,
  };
}

export function settleSelectedScopeRestorationIfCurrentEpoch(
  current: SelectedScopeState,
  currentAuth: Pick<SelectedScopeEpoch, "identityGeneration" | "sessionGeneration">,
  expected: SelectedScopeEpoch,
  selectedScope: SelectedDashboardScope | null,
  persistence: "preserve" | "sync",
): SelectedScopeState {
  if (
    current.restorationStatus !== "checking" ||
    currentAuth.identityGeneration !== expected.identityGeneration ||
    currentAuth.sessionGeneration !== expected.sessionGeneration ||
    current.identityGeneration !== expected.identityGeneration ||
    current.selectionRevision !== expected.selectionRevision
  ) return current;
  const next = advanceSelectedScopeState(current, expected.identityGeneration, selectedScope);
  return { ...next, persistence };
}

export function advanceSelectedScopeStateIfCurrentEpoch(
  current: SelectedScopeState,
  currentAuth: Pick<SelectedScopeEpoch, "identityGeneration" | "sessionGeneration">,
  expected: SelectedScopeEpoch,
  selectedScope: SelectedDashboardScope | null,
): SelectedScopeState {
  if (
    currentAuth.identityGeneration !== expected.identityGeneration ||
    currentAuth.sessionGeneration !== expected.sessionGeneration ||
    current.identityGeneration !== expected.identityGeneration ||
    current.selectionRevision !== expected.selectionRevision
  ) {
    return current;
  }
  return advanceSelectedScopeState(
    current,
    expected.identityGeneration,
    selectedScope,
  );
}
