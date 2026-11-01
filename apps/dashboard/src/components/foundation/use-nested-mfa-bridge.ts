"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { SelectedDashboardScope } from "../scope";
import type { NestedMfaReadResult } from "./protected-dashboard-context";
import { selectedScopeAuthorityKey } from "./selected-scope-revalidation-policy";

export interface NestedMfaEpoch {
  readonly key: string;
  readonly cycleKey: string;
  readonly revision: number;
  readonly visit: symbol;
}

export interface NestedMfaBridgeState {
  readonly challenge: NestedMfaEpoch | null;
  readonly exhausted: {
    readonly cycleKey: string;
    readonly minimumRevision: number;
    readonly visit: symbol;
  } | null;
}

export const initialNestedMfaBridgeState: NestedMfaBridgeState = {
  challenge: null,
  exhausted: null,
};

function sameEpoch(
  left: NestedMfaEpoch | null,
  right: NestedMfaEpoch,
): boolean {
  return left !== null && left.key === right.key && left.visit === right.visit;
}

function sameCycle(
  exhausted: NestedMfaBridgeState["exhausted"],
  epoch: NestedMfaEpoch,
): boolean {
  return (
    exhausted !== null &&
    exhausted.cycleKey === epoch.cycleKey &&
    exhausted.visit === epoch.visit
  );
}

export function isNestedMfaReadError(
  reason: unknown,
): reason is DashboardApiError {
  return (
    reason instanceof DashboardApiError &&
    reason.kind === "mfa" &&
    reason.status === 403 &&
    reason.code === "MFA_STEP_UP_REQUIRED"
  );
}

export function nestedMfaReadResult(
  errors: readonly (Error | null)[],
  allPrimaryReadsSucceeded: boolean,
): NestedMfaReadResult | null {
  const reason = errors.find(isNestedMfaReadError);
  if (reason) return { kind: "required", reason };
  return allPrimaryReadsSucceeded ? { kind: "succeeded" } : null;
}

export function advanceNestedMfaBridge(
  state: NestedMfaBridgeState,
  live: NestedMfaEpoch,
  source: NestedMfaEpoch,
  action: NestedMfaReadResult["kind"] | "assured",
): NestedMfaBridgeState {
  if (!sameEpoch(source, live)) return state;
  if (action === "required") {
    if (sameCycle(state.exhausted, live) || sameEpoch(state.challenge, live))
      return state;
    return { ...state, challenge: live };
  }
  if (action === "assured") {
    if (!sameEpoch(state.challenge, live)) return state;
    return {
      challenge: null,
      exhausted: {
        cycleKey: live.cycleKey,
        minimumRevision: live.revision + 1,
        visit: live.visit,
      },
    };
  }
  if (
    state.exhausted === null ||
    !sameCycle(state.exhausted, live) ||
    live.revision < state.exhausted.minimumRevision
  )
    return state;
  return { ...state, exhausted: null };
}

export function useNestedMfaBridge(input: {
  readonly currentPath: string;
  readonly identityGeneration: number;
  readonly selectedScope: SelectedDashboardScope | null;
  readonly selectionRevision: number;
  readonly sessionGeneration: number;
}) {
  // Each route visit has its own identity, including A -> B -> A navigation.
  const visit = useMemo(() => Symbol(input.currentPath), [input.currentPath]);
  const authorityKey = selectedScopeAuthorityKey(input.selectedScope);
  const cycleKey = JSON.stringify([
    input.identityGeneration,
    input.sessionGeneration,
    authorityKey,
    input.currentPath,
  ]);
  const key = `${cycleKey}:${input.selectionRevision}`;
  const epoch = useMemo<NestedMfaEpoch>(
    () => ({
      cycleKey,
      key,
      revision: input.selectionRevision,
      visit,
    }),
    [cycleKey, key, input.selectionRevision, visit],
  );
  const live = useRef(epoch);
  useLayoutEffect(() => {
    live.current = epoch;
  }, [epoch]);
  const [state, setState] = useState(initialNestedMfaBridgeState);
  const stateRef = useRef(state);
  const apply = useCallback(
    (
      source: NestedMfaEpoch,
      action: NestedMfaReadResult["kind"] | "assured",
    ) => {
      const previous = stateRef.current;
      const next = advanceNestedMfaBridge(
        previous,
        live.current,
        source,
        action,
      );
      if (next === previous) return false;
      stateRef.current = next;
      setState(next);
      return true;
    },
    [],
  );
  const onReadResult = useCallback(
    (result: NestedMfaReadResult) => {
      if (result.kind === "required" && !isNestedMfaReadError(result.reason))
        return;
      apply(epoch, result.kind);
    },
    [apply, epoch],
  );
  const completeAssurance = useCallback(
    () => apply(epoch, "assured"),
    [apply, epoch],
  );
  return {
    completeAssurance,
    generationKey: `nested-mfa:${key}`,
    onReadResult,
    required: sameEpoch(state.challenge, epoch),
  };
}
