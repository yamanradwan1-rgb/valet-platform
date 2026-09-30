"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

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
  const pathRef = useRef(input.currentPath);
  pathRef.current = input.currentPath;

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
      input.clearScopeIfEpoch(epoch);
    },
    [input.clearScopeIfEpoch],
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
      transitionRef.current = {
        identityGeneration: input.identityGeneration,
        expectedRevision: input.selectionRevision + 1,
        sessionGeneration: input.sessionGeneration,
        sourcePath: input.currentPath,
        targetPath,
      };
    },
    [
      input.currentPath,
      input.identityGeneration,
      input.selectionRevision,
      input.sessionGeneration,
    ],
  );

  const transition = transitionRef.current;
  const transitionActive =
    transition?.identityGeneration === input.identityGeneration &&
    transition.sessionGeneration === input.sessionGeneration &&
    transition.expectedRevision === input.selectionRevision &&
    transition.sourcePath === input.currentPath;

  return { beginTransition, onDenied, transitionActive };
}
