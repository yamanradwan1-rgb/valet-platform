"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { SelectedScopeEpoch } from "./selected-scope-state";
import type { SelectedScopeDenialKind } from "./use-selected-scope-revalidation";

interface RouteTransition {
  readonly identityGeneration: number;
  readonly expectedRevision: number;
  readonly sessionGeneration: number;
  readonly sourcePath: string;
  readonly targetPath: string;
}

export function useSelectedManagementShellTransition(input: {
  readonly clearScopeIfEpoch: (epoch: SelectedScopeEpoch) => void;
  readonly currentPath: string;
  readonly identityGeneration: number;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
}) {
  const transitionRef = useRef<RouteTransition | null>(null);
  const [renderTransition, setRenderTransition] = useState<RouteTransition | null>(null);
  const pathRef = useRef(input.currentPath);
  const { clearScopeIfEpoch, currentPath } = input;

  useLayoutEffect(() => {
    pathRef.current = currentPath;
  }, [currentPath]);

  const onDenied = useCallback(
    (epoch: SelectedScopeEpoch, kind: SelectedScopeDenialKind) => {
      const transition = transitionRef.current;
      if (
        kind === "ROUTE_DENIED" &&
        transition !== null &&
        epoch.identityGeneration === transition.identityGeneration &&
        epoch.sessionGeneration === transition.sessionGeneration &&
        epoch.selectionRevision === transition.expectedRevision &&
        pathRef.current === transition.sourcePath
      ) {
        return;
      }
      clearScopeIfEpoch(epoch);
    },
    [clearScopeIfEpoch],
  );

  useLayoutEffect(() => {
    const transition = transitionRef.current;
    if (transition === null) return;
    if (
      transition.identityGeneration !== input.identityGeneration ||
      transition.sessionGeneration !== input.sessionGeneration ||
      transition.expectedRevision !== input.selectionRevision ||
      input.currentPath === transition.targetPath ||
      input.currentPath !== transition.sourcePath
    ) {
      transitionRef.current = null;
    }
  }, [
    input.currentPath,
    input.identityGeneration,
    input.selectionRevision,
    input.sessionGeneration,
  ]);

  const beginTransition = useCallback(
    (targetPath: string) => {
      const nextTransition: RouteTransition = {
        identityGeneration: input.identityGeneration,
        expectedRevision: input.selectionRevision + 1,
        sessionGeneration: input.sessionGeneration,
        sourcePath: input.currentPath,
        targetPath,
      };
      transitionRef.current = nextTransition;
      setRenderTransition(nextTransition);
    },
    [
      input.currentPath,
      input.identityGeneration,
      input.selectionRevision,
      input.sessionGeneration,
    ],
  );

  const transitionActive =
    renderTransition?.identityGeneration === input.identityGeneration &&
    renderTransition.sessionGeneration === input.sessionGeneration &&
    renderTransition.expectedRevision === input.selectionRevision &&
    renderTransition.sourcePath === input.currentPath;

  return { beginTransition, onDenied, transitionActive };
}
