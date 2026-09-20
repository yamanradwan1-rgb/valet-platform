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

interface SelectedScopeContextValue {
  readonly selectedScope: SelectedDashboardScope | null;
  readonly selectScope: (scope: SelectedDashboardScope) => void;
  readonly clearScope: () => void;
}

interface ScopeState {
  readonly identityGeneration: number;
  readonly selectedScope: SelectedDashboardScope | null;
}

const SelectedScopeContext = createContext<SelectedScopeContextValue | null>(null);

export function SelectedScopeProvider({ children }: { readonly children: ReactNode }) {
  const { identityGeneration } = useStaffAuth();
  const [state, setState] = useState<ScopeState>({
    identityGeneration,
    selectedScope: null,
  });
  const selectedScope =
    state.identityGeneration === identityGeneration ? state.selectedScope : null;

  const selectScope = useCallback(
    (scope: SelectedDashboardScope) => {
      setState({ identityGeneration, selectedScope: scope });
    },
    [identityGeneration],
  );
  const clearScope = useCallback(() => {
    setState({ identityGeneration, selectedScope: null });
  }, [identityGeneration]);

  const value = useMemo(
    () => ({ clearScope, selectedScope, selectScope }),
    [clearScope, selectedScope, selectScope],
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
