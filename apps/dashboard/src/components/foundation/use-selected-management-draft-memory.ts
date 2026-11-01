"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { SelectedDashboardScope } from "../scope";
import { selectedScopeAuthorityKey } from "./selected-scope-revalidation-policy";
import { NestedMfaDraftMemory } from "./nested-mfa-draft-memory";
import type { NestedMfaReadResult } from "./protected-dashboard-context";
import { isNestedMfaReadError } from "./use-nested-mfa-bridge";

export function managementGuestDraftOwnerKey(input: {
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly staffSessionId: string | null;
  readonly authority: string | null;
  readonly currentPath: string;
}): string {
  // Refreshing an access token increments sessionGeneration even when the
  // persisted Staff session stays the same. Unknown continuity fails closed.
  const unknownSessionGeneration =
    input.staffSessionId === null ? input.sessionGeneration : null;
  return JSON.stringify([
    input.identityGeneration,
    input.staffSessionId,
    unknownSessionGeneration,
    input.authority,
    input.currentPath,
  ]);
}

export function useSelectedManagementDraftMemory(input: {
  readonly currentPath: string;
  readonly identityGeneration: number;
  readonly sessionGeneration: number;
  readonly staffSessionId: string | null;
  readonly selectedScope: SelectedDashboardScope | null;
  readonly validationStatus: string;
  readonly onReadResult: (result: NestedMfaReadResult) => void;
  readonly completeAssurance: () => boolean;
}) {
  const { onReadResult: forwardRead, completeAssurance: finishAssurance } =
    input;
  const owner = managementGuestDraftOwnerKey({
    identityGeneration: input.identityGeneration,
    sessionGeneration: input.sessionGeneration,
    staffSessionId: input.staffSessionId,
    authority: selectedScopeAuthorityKey(input.selectedScope),
    currentPath: input.currentPath,
  });
  const memory = useMemo(
    () =>
      input.currentPath === "/guest-information" && input.selectedScope !== null
        ? new NestedMfaDraftMemory()
        : null,
    // The owner includes the exact Staff session, tenant, Location and route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [owner],
  );
  const lastSession = useRef({ memory, generation: input.sessionGeneration });
  useLayoutEffect(() => {
    const last = lastSession.current;
    if (
      last.memory === memory &&
      last.generation !== input.sessionGeneration &&
      input.staffSessionId !== null
    )
      memory?.resumeAfterSameSessionRefresh();
    lastSession.current = { memory, generation: input.sessionGeneration };
  }, [input.sessionGeneration, input.staffSessionId, memory]);
  useEffect(() => {
    if (
      input.validationStatus === "denied" ||
      input.validationStatus === "entitlement"
    )
      memory?.clear();
  }, [input.validationStatus, memory]);
  const onReadResult = useCallback(
    (result: NestedMfaReadResult) => {
      if (result.kind === "required" && isNestedMfaReadError(result.reason)) {
        memory?.challenge();
      }
      forwardRead(result);
    },
    [forwardRead, memory],
  );
  const completeAssurance = useCallback(() => {
    if (!finishAssurance()) return false;
    memory?.assured();
    return true;
  }, [finishAssurance, memory]);
  return { memory, onReadResult, completeAssurance };
}
