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
}

export interface UseTaskQueueResult {
  readonly tasks: StaffTaskQueueItem[];
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly error: Error | null;
  readonly refresh: () => Promise<void>;
}

export function useTaskQueue(options: UseTaskQueueOptions): UseTaskQueueResult {
  const {
    locationId,
    client: customClient,
    pollingIntervalMs = 5000,
  } = options;
  const auth = useOptionalStaffAuth();
  const status = auth?.status ?? "unauthenticated";
  const authClient = auth?.client;

  const [tasks, setTasks] = useState<StaffTaskQueueItem[]>([]);
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

  const poll = useCallback(
    async (isInitial = false): Promise<void> => {
      if (status !== "authenticated" || !locationId) {
        setTasks([]);
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

      if (isInitial && tasks.length === 0) {
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
          setTasks(response.tasks);
          setError(null);
        }
      } catch (err: unknown) {
        if (!abortController.signal.aborted) {
          if (
            err instanceof EmployeeApiError &&
            (err.status === 401 || err.status === 403 || err.status === 404)
          ) {
            setTasks([]);
            setError(err);
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
    [status, locationId, apiClient, tasks.length],
  );

  useEffect(() => {
    if (status !== "authenticated" || !locationId) {
      return undefined;
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    const abortController = new AbortController();
    activeAbortRef.current = abortController;

    const executePoll = async (isInitial: boolean) => {
      if (inFlightRef.current) return;
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
          setTasks(response.tasks);
          setError(null);
        }
      } catch (err: unknown) {
        if (!abortController.signal.aborted) {
          if (
            err instanceof EmployeeApiError &&
            (err.status === 401 || err.status === 403 || err.status === 404)
          ) {
            setTasks([]);
            setError(err);
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
      pollTimer = setInterval(() => {
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
      if (document.visibilityState === "visible") {
        void executePoll(false);
        startTimer();
      } else {
        stopTimer();
      }
    };

    const onOnline = () => {
      void executePoll(false);
      startTimer();
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

  const refresh = useCallback(() => poll(false), [poll]);

  const effectiveTasks = status === "authenticated" && locationId ? tasks : [];

  return {
    tasks: effectiveTasks,
    isLoading: status === "authenticated" && locationId ? isLoading : false,
    isRefreshing:
      status === "authenticated" && locationId ? isRefreshing : false,
    error: status === "authenticated" && locationId ? error : null,
    refresh,
  };
}
