"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StaffTaskQueueItem } from "@valet/contracts";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import { fetchTaskQueue } from "./task-queue-api";

export interface UseTaskQueueOptions {
  readonly locationId: string | null;
  readonly client?: EmployeeApiClient | undefined;
  readonly pollingIntervalMs?: number | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
}

export interface UseTaskQueueResult {
  readonly tasks: StaffTaskQueueItem[];
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isHardStopped: boolean;
  readonly error: Error | null;
  readonly refresh: () => Promise<void>;
}

interface ScopedQueueState {
  readonly scopeLocationId: string | null;
  readonly tasks: StaffTaskQueueItem[];
  readonly isHardStopped: boolean;
}

export function useTaskQueue(options: UseTaskQueueOptions): UseTaskQueueResult {
  const {
    locationId,
    client: customClient,
    pollingIntervalMs = 5000,
    onAuthorizationLoss,
  } = options;
  const auth = useOptionalStaffAuth();
  const status = auth?.status ?? "unauthenticated";
  const authClient = auth?.client;

  const [queueState, setQueueState] = useState<ScopedQueueState>({
    scopeLocationId: null,
    tasks: [],
    isHardStopped: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const apiClient = useMemo(
    () =>
      customClient ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
      }),
    [customClient, authClient],
  );

  const inFlightRef = useRef<boolean>(false);
  const sequenceRef = useRef<number>(0);
  const latestCompletedSeqRef = useRef<number>(0);
  const activeAbortRef = useRef<AbortController | null>(null);
  const onAuthLossRef = useRef<(() => void) | undefined>(onAuthorizationLoss);

  useEffect(() => {
    onAuthLossRef.current = onAuthorizationLoss;
  }, [onAuthorizationLoss]);

  const poll = useCallback(
    async (isInitial = false): Promise<void> => {
      if (status !== "authenticated" || !locationId) {
        setQueueState({
          scopeLocationId: null,
          tasks: [],
          isHardStopped: false,
        });
        setIsLoading(false);
        setIsRefreshing(false);
        setError(null);
        return;
      }

      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;

      const currentSeq = ++sequenceRef.current;
      const abortController = new AbortController();
      activeAbortRef.current = abortController;

      if (isInitial && queueState.tasks.length === 0) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const response = await fetchTaskQueue(apiClient, locationId, {
          signal: abortController.signal,
        });

        if (
          !abortController.signal.aborted &&
          currentSeq > latestCompletedSeqRef.current
        ) {
          latestCompletedSeqRef.current = currentSeq;
          setQueueState({
            scopeLocationId: locationId,
            tasks: response.tasks,
            isHardStopped: false,
          });
          setError(null);
        }
      } catch (err: unknown) {
        if (!abortController.signal.aborted) {
          if (
            err instanceof EmployeeApiError &&
            (err.status === 401 || err.status === 403 || err.status === 404)
          ) {
            // Hard auth / scope revocation: clear tasks, set hard-stop, notify owner
            setQueueState({
              scopeLocationId: null,
              tasks: [],
              isHardStopped: true,
            });
            setError(err);
            onAuthLossRef.current?.();
          } else if (currentSeq > latestCompletedSeqRef.current) {
            setError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      } finally {
        inFlightRef.current = false;
        if (!abortController.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [status, locationId, apiClient, queueState.tasks.length],
  );

  useEffect(() => {
    if (status !== "authenticated" || !locationId) {
      return undefined;
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let localHardStopped = false;
    const abortController = new AbortController();
    activeAbortRef.current = abortController;

    const executePoll = async (isInitial: boolean) => {
      if (inFlightRef.current || localHardStopped) return;
      inFlightRef.current = true;
      const currentSeq = ++sequenceRef.current;

      if (isInitial) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      try {
        const response = await fetchTaskQueue(apiClient, locationId, {
          signal: abortController.signal,
        });
        if (
          !abortController.signal.aborted &&
          currentSeq > latestCompletedSeqRef.current
        ) {
          latestCompletedSeqRef.current = currentSeq;
          setQueueState({
            scopeLocationId: locationId,
            tasks: response.tasks,
            isHardStopped: false,
          });
          setError(null);
        }
      } catch (err: unknown) {
        if (!abortController.signal.aborted) {
          if (
            err instanceof EmployeeApiError &&
            (err.status === 401 || err.status === 403 || err.status === 404)
          ) {
            localHardStopped = true;
            setQueueState({
              scopeLocationId: null,
              tasks: [],
              isHardStopped: true,
            });
            setError(err);
            if (pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
            onAuthLossRef.current?.();
          } else if (currentSeq > latestCompletedSeqRef.current) {
            setError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      } finally {
        inFlightRef.current = false;
        if (!abortController.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void executePoll(true);

    const startTimer = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (localHardStopped) return;
      pollTimer = setInterval(() => {
        if (localHardStopped) {
          if (pollTimer) clearInterval(pollTimer);
          return;
        }
        void executePoll(false);
      }, pollingIntervalMs);
    };

    const stopTimer = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    startTimer();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !localHardStopped) {
        void executePoll(false);
        startTimer();
      } else {
        stopTimer();
      }
    };

    const onOnline = () => {
      if (!localHardStopped) {
        void executePoll(false);
        startTimer();
      }
    };

    const onOffline = () => {
      stopTimer();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      abortController.abort();
    };
  }, [status, locationId, pollingIntervalMs, apiClient]);

  const refresh = useCallback(async () => {
    await poll(false);
  }, [poll]);

  // Synchronously enforce that effective tasks match current scope locationId
  const effectiveTasks =
    status === "authenticated" &&
    locationId !== null &&
    queueState.scopeLocationId === locationId
      ? queueState.tasks
      : [];

  const isHardStopped =
    queueState.scopeLocationId === locationId
      ? queueState.isHardStopped
      : false;

  return {
    tasks: effectiveTasks,
    isLoading: status === "authenticated" && locationId ? isLoading : false,
    isRefreshing:
      status === "authenticated" && locationId ? isRefreshing : false,
    isHardStopped,
    error: status === "authenticated" && locationId ? error : null,
    refresh,
  };
}
