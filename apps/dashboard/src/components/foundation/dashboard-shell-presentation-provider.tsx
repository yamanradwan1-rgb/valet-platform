"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { DashboardNavigationItem } from "../../lib/navigation";
import type { SelectedDashboardScope } from "../scope";
import { selectedScopeAuthorityKey } from "./selected-scope-revalidation-policy";

interface DashboardShellPresentationSnapshot {
  readonly key: string;
  readonly destinationIds: readonly string[];
}

interface DashboardShellPresentationContextValue {
  readonly remember: (
    key: string,
    navigation: readonly DashboardNavigationItem[],
  ) => void;
  readonly read: (key: string) => DashboardShellPresentationSnapshot | null;
}

const DashboardShellPresentationContext =
  createContext<DashboardShellPresentationContextValue | null>(null);

export function dashboardShellPresentationKey(input: {
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly selectionRevision: number;
  readonly selectedScope: SelectedDashboardScope;
}): string {
  return [
    input.identityGeneration,
    input.sessionGeneration,
    input.selectionRevision,
    selectedScopeAuthorityKey(input.selectedScope),
  ].join(":");
}

export function DashboardShellPresentationProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [snapshot, setSnapshot] =
    useState<DashboardShellPresentationSnapshot | null>(null);
  const remember = useCallback(
    (key: string, navigation: readonly DashboardNavigationItem[]) => {
      const destinationIds = navigation
        .filter((item) => item.id !== "security")
        .map((item) => item.id);
      setSnapshot((current) => {
        if (
          current?.key === key &&
          current.destinationIds.length === destinationIds.length &&
          current.destinationIds.every((id, index) => id === destinationIds[index])
        ) {
          return current;
        }
        return { destinationIds, key };
      });
    },
    [],
  );
  const read = useCallback(
    (key: string) => (snapshot?.key === key ? snapshot : null),
    [snapshot],
  );
  const value = useMemo(() => ({ read, remember }), [read, remember]);
  return (
    <DashboardShellPresentationContext.Provider value={value}>
      {children}
    </DashboardShellPresentationContext.Provider>
  );
}

export function DashboardNavigationPresentationCapture({
  bindingKey,
  navigation,
}: {
  readonly bindingKey: string;
  readonly navigation: readonly DashboardNavigationItem[];
}) {
  const { remember } = useDashboardShellPresentation();
  useEffect(() => remember(bindingKey, navigation), [bindingKey, navigation, remember]);
  return null;
}

export function useDashboardShellPresentation(): DashboardShellPresentationContextValue {
  const value = useContext(DashboardShellPresentationContext);
  if (!value) {
    throw new Error(
      "useDashboardShellPresentation requires DashboardShellPresentationProvider",
    );
  }
  return value;
}
