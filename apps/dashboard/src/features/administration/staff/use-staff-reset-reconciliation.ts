"use client";

import type {
  StaffPasswordResetIssueRequest,
  StaffPasswordResetStatusResponse,
} from "@valet/contracts";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { DashboardApiClient } from "../../../lib/api/dashboard-api-client";
import { readStaffPasswordResetStatus } from "./staff-password-reset-api";

type Phase = "checking" | "blocked" | "same-operation" | "replacement" | null;

interface StatusView {
  readonly data: StaffPasswordResetStatusResponse | null;
  readonly error: Error | null;
  readonly loading: boolean;
  readonly phase: Phase;
}

export function useStaffResetReconciliation(
  api: DashboardApiClient,
  organizationId: string,
  membershipId: string,
  attemptRef: RefObject<StaffPasswordResetIssueRequest | null>,
) {
  // Both ordinary reads and unknown-COMMIT reconciliation use the SAME
  // revision. No independently cached snapshot is allowed to authorize a POST.
  const [view, setView] = useState<StatusView>({
    data: null,
    error: null,
    loading: true,
    phase: null,
  });
  const revisionRef = useRef(0);
  const highestGenerationRef = useRef(-1);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  const invalidate = useCallback(() => {
    revisionRef.current++;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidate();
      attemptRef.current = null;
    };
  }, [attemptRef, invalidate]);

  const readStatus = useCallback(
    async (command: StaffPasswordResetIssueRequest | null) => {
      invalidate();
      const ticket = revisionRef.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      setView((previous) => ({
        ...previous,
        error: null,
        loading: true,
        phase: command || attemptRef.current ? "checking" : null,
      }));
      const isCurrent = () =>
        mountedRef.current &&
        !controller.signal.aborted &&
        revisionRef.current === ticket &&
        (command === null || attemptRef.current === command);
      try {
        const current = await readStaffPasswordResetStatus(
          api,
          organizationId,
          membershipId,
          controller.signal,
        );
        if (!isCurrent()) return;
        const previousGeneration = highestGenerationRef.current;
        highestGenerationRef.current = Math.max(
          previousGeneration,
          current.latestGeneration,
        );
        const active = attemptRef.current;
        if (
          !current.eligible ||
          current.latestGeneration < previousGeneration ||
          (active && current.latestGeneration < active.expectedGeneration)
        ) {
          setView({
            data: current,
            error: null,
            loading: false,
            phase: "blocked",
          });
        } else if (
          active &&
          current.latestGeneration > active.expectedGeneration
        ) {
          attemptRef.current = null;
          setView({
            data: current,
            error: null,
            loading: false,
            phase: "replacement",
          });
        } else {
          setView({
            data: current,
            error: null,
            loading: false,
            phase: active ? "same-operation" : null,
          });
        }
      } catch (reason) {
        if (!isCurrent()) return;
        setView({
          data: null,
          error:
            reason instanceof Error ? reason : new Error("Status read failed"),
          loading: false,
          phase: "blocked",
        });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [api, organizationId, membershipId, attemptRef, invalidate],
  );

  const refresh = useCallback(() => {
    void readStatus(null);
  }, [readStatus]);
  const reconcile = useCallback(
    (command: StaffPasswordResetIssueRequest) => readStatus(command),
    [readStatus],
  );

  useEffect(() => {
    // Initial state is already loading. Schedule the first GET after mount;
    // subsequent explicit reads increment the same revision synchronously.
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const reset = useCallback(() => {
    invalidate();
    setView((previous) => ({ ...previous, phase: null }));
  }, [invalidate]);
  const pending = useCallback(() => {
    invalidate();
    setView((previous) => ({
      ...previous,
      error: null,
      loading: true,
      phase: "checking",
    }));
  }, [invalidate]);
  const block = useCallback(() => {
    invalidate();
    setView((previous) => ({ ...previous, loading: false, phase: "blocked" }));
  }, [invalidate]);

  return {
    state: view.phase === null ? null : { phase: view.phase },
    status: {
      data: view.data,
      error: view.error,
      loading: view.loading,
      refresh,
    },
    reset,
    pending,
    block,
    reconcile,
  } as const;
}
