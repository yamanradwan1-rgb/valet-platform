"use client";

import type {
  StaffPasswordResetIssueRequest,
  StaffPasswordResetStatusResponse,
} from "@valet/contracts";
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { readStaffPasswordResetStatus } from "./staff-password-reset-api";

type Phase = "checking" | "blocked" | "same-operation" | "replacement";

interface ReconciliationState {
  readonly phase: Phase;
  // Only this successfully reconciled direct GET may authorize another POST.
  readonly verifiedStatus: StaffPasswordResetStatusResponse | null;
}

export function useStaffResetReconciliation(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  attemptRef: RefObject<StaffPasswordResetIssueRequest | null>,
) {
  const [state, setState] = useState<ReconciliationState | null>(null);
  const revision = useRef(0);
  const pendingRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const invalidate = useCallback(() => {
    revision.current++;
    pendingRequest.current?.abort();
    pendingRequest.current = null;
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      invalidate();
      // Membership, tenant or session change must not carry an old operation.
      attemptRef.current = null;
    };
  }, [api, organizationId, membershipId, attemptRef, invalidate]);

  const reset = useCallback(() => {
    invalidate();
    setState(null);
  }, [invalidate]);

  const pending = useCallback(() => {
    setState((previous) =>
      previous?.phase === "checking"
        ? previous
        : { phase: "checking", verifiedStatus: null },
    );
  }, []);

  const block = useCallback(() => {
    invalidate();
    setState({ phase: "blocked", verifiedStatus: null });
  }, [invalidate]);

  const reconcile = useCallback(async (command: StaffPasswordResetIssueRequest) => {
    invalidate();
    const currentRevision = revision.current;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setState({ phase: "checking", verifiedStatus: null });
    const isLatest = () =>
      mounted.current &&
      !controller.signal.aborted &&
      revision.current === currentRevision &&
      attemptRef.current === command;
    try {
      const current = await readStaffPasswordResetStatus(
        api, organizationId, membershipId, controller.signal,
      );
      if (!isLatest()) return;
      if (!current.eligible || current.latestGeneration < command.expectedGeneration) {
        setState({ phase: "blocked", verifiedStatus: null });
      } else if (current.latestGeneration > command.expectedGeneration) {
        attemptRef.current = null;
        setState({ phase: "replacement", verifiedStatus: current });
      } else {
        setState({ phase: "same-operation", verifiedStatus: current });
      }
    } catch {
      if (isLatest()) setState({ phase: "blocked", verifiedStatus: null });
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
    }
  }, [api, organizationId, membershipId, attemptRef, invalidate]);

  return { state, reset, pending, block, reconcile } as const;
}
