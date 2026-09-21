"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { SelectedDashboardScope } from "../scope";

export interface ProtectedDashboardContextValue {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly selectedScope: SelectedDashboardScope;
  readonly sessionGeneration: number;
}

const ProtectedDashboardContext =
  createContext<ProtectedDashboardContextValue | null>(null);

export function ProtectedDashboardContextProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: ProtectedDashboardContextValue;
}) {
  return (
    <ProtectedDashboardContext.Provider value={value}>
      {children}
    </ProtectedDashboardContext.Provider>
  );
}

export function useProtectedDashboard(): ProtectedDashboardContextValue {
  const value = useContext(ProtectedDashboardContext);
  if (value === null) {
    throw new Error("useProtectedDashboard requires ProtectedDashboardRoute.");
  }
  return value;
}
