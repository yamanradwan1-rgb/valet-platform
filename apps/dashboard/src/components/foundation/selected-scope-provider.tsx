"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";

import {
  useSelectedScopeLifecycle,
  type SelectedScopeLifecycle,
} from "./use-selected-scope-lifecycle";

const SelectedScopeContext = createContext<SelectedScopeLifecycle | null>(null);

export function SelectedScopeProvider({ children }: { readonly children: ReactNode }) {
  const value = useSelectedScopeLifecycle();
  return (
    <SelectedScopeContext.Provider value={value}>
      {children}
    </SelectedScopeContext.Provider>
  );
}

export function useSelectedScope(): SelectedScopeLifecycle {
  const value = useContext(SelectedScopeContext);
  if (!value) throw new Error("useSelectedScope requires SelectedScopeProvider");
  return value;
}
