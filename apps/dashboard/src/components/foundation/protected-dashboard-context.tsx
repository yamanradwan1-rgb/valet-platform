"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { DashboardApiClient } from "../../lib/api/dashboard-api-client";
import type { SelectedDashboardScope } from "../scope";
import type { NestedMfaDraftMemory } from "./nested-mfa-draft-memory";

export type NestedMfaReadResult =
  | { readonly kind: "required"; readonly reason: Error }
  | { readonly kind: "succeeded" };

export interface ProtectedDashboardContextValue {
  readonly api: DashboardApiClient;
  readonly identityGeneration: number;
  readonly selectedScope: SelectedDashboardScope;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
  readonly draftMemory?: NestedMfaDraftMemory | null;
  readonly onNestedMfaRead?: (result: NestedMfaReadResult) => void;
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

export function useOptionalGuestDraftMemory(): NestedMfaDraftMemory | null {
  return useContext(ProtectedDashboardContext)?.draftMemory ?? null;
}
