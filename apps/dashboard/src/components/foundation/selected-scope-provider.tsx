"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useStaffAuth } from "../../lib/auth/staff-auth-context";
import type { SelectedDashboardScope } from "../scope";
import {
  advanceSelectedScopeState,
  advanceSelectedScopeStateIfCurrentEpoch,
  type SelectedScopeEpoch,
  type SelectedScopeState,
} from "./selected-scope-state";

interface SelectedScopeContextValue {
  readonly clearScopeIfEpoch: (epoch: SelectedScopeEpoch) => void;
  readonly selectedScope: SelectedDashboardScope | null;
  readonly selectionRevision: number;
  readonly selectScope: (scope: SelectedDashboardScope) => void;
  readonly clearScope: () => void;
}

const SelectedScopeContext = createContext<SelectedScopeContextValue | null>(null);

export function SelectedScopeProvider({ children }: { readonly children: ReactNode }) {
  const { client, identityGeneration } = useStaffAuth();
  const [state, setState] = useState<SelectedScopeState>({
    identityGeneration,
    selectionRevision: 0,
    selectedScope: null,
  });
  const selectedScope =
    state.identityGeneration === identityGeneration ? state.selectedScope : null;
  const selectionRevision =
    state.identityGeneration === identityGeneration ? state.selectionRevision : 0;

  const selectScope = useCallback(
    (scope: SelectedDashboardScope) => {
      setState((current) => advanceSelectedScopeState(current, identityGeneration, scope));
    },
    [identityGeneration],
  );
  const clearScope = useCallback(() => {
    setState((current) => advanceSelectedScopeState(current, identityGeneration, null));
  }, [identityGeneration]);
  const clearScopeIfEpoch = useCallback((expected: SelectedScopeEpoch) => {
    setState((current) =>
      advanceSelectedScopeStateIfCurrentEpoch(
        current,
        {
          identityGeneration: client.getIdentityGeneration(),
          sessionGeneration: client.getSessionGeneration(),
        },
        expected,
        null,
      ));
  }, [client]);

  const value = useMemo(
    () => ({
      clearScope,
      clearScopeIfEpoch,
      selectedScope,
      selectionRevision,
      selectScope,
    }),
    [clearScope, clearScopeIfEpoch, selectedScope, selectionRevision, selectScope],
  );
  return (
    <SelectedScopeContext.Provider value={value}>
      {children}
    </SelectedScopeContext.Provider>
  );
}

export function useSelectedScope(): SelectedScopeContextValue {
  const value = useContext(SelectedScopeContext);
  if (!value) throw new Error("useSelectedScope requires SelectedScopeProvider");
  return value;
}
