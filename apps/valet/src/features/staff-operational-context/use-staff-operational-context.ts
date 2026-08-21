"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StaffOperationalContextResponse } from "@valet/contracts";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import { fetchStaffOperationalContext } from "./staff-operational-context-api";
import {
  resolveOperationalScope,
  type OperationalScopeResolution,
} from "./staff-operational-context-resolver";

export interface UseStaffOperationalContextResult {
  readonly response: StaffOperationalContextResponse | null;
  readonly resolution: OperationalScopeResolution;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly refresh: () => Promise<void>;
  readonly revalidateOnAuthLoss: () => Promise<void>;
}

export function useStaffOperationalContext(
  customApiClient?: EmployeeApiClient | undefined,
): UseStaffOperationalContextResult {
  const auth = useOptionalStaffAuth();
  const status = auth?.status ?? "unauthenticated";
  const accessToken = auth?.session?.accessToken ?? null;
  const authClient = auth?.client;

  const [storedResponse, setStoredResponse] = useState<{
    token: string | null;
    data: StaffOperationalContextResponse | null;
  }>({
    token: null,
    data: null,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const apiClient = useMemo(
    () =>
      customApiClient ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
      }),
    [customApiClient, authClient],
  );

  const sequenceRef = useRef<number>(0);
  const latestCompletedSeqRef = useRef<number>(0);
  const activeAbortRef = useRef<AbortController | null>(null);

  const loadContext = useCallback(
    async (isAuthLossRevalidation = false): Promise<void> => {
      if (status !== "authenticated" || !accessToken) {
        if (activeAbortRef.current) {
          activeAbortRef.current.abort();
          activeAbortRef.current = null;
        }
        sequenceRef.current++;
        return;
      }

      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
      }
      const abortController = new AbortController();
      activeAbortRef.current = abortController;

      const currentSeq = ++sequenceRef.current;

      if (isAuthLossRevalidation) {
        setStoredResponse({ token: null, data: null });
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchStaffOperationalContext(apiClient, {
          signal: abortController.signal,
        });

        if (
          !abortController.signal.aborted &&
          currentSeq === sequenceRef.current &&
          currentSeq > latestCompletedSeqRef.current
        ) {
          latestCompletedSeqRef.current = currentSeq;
          setStoredResponse({ token: accessToken, data });
          setError(null);
        }
      } catch (err: unknown) {
        if (
          !abortController.signal.aborted &&
          currentSeq === sequenceRef.current
        ) {
          if (
            err instanceof EmployeeApiError &&
            (err.status === 401 || err.status === 403 || err.status === 404)
          ) {
            setStoredResponse({ token: null, data: null });
          }
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (
          !abortController.signal.aborted &&
          currentSeq === sequenceRef.current
        ) {
          setIsLoading(false);
        }
      }
    },
    [status, accessToken, apiClient],
  );

  useEffect(() => {
    if (status !== "authenticated" || !accessToken) {
      if (activeAbortRef.current) {
        activeAbortRef.current.abort();
        activeAbortRef.current = null;
      }
      sequenceRef.current++;
      return undefined;
    }

    const abortController = new AbortController();
    activeAbortRef.current = abortController;
    const currentSeq = ++sequenceRef.current;

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchStaffOperationalContext(apiClient, {
          signal: abortController.signal,
        });

        if (
          !abortController.signal.aborted &&
          currentSeq === sequenceRef.current &&
          currentSeq > latestCompletedSeqRef.current
        ) {
          latestCompletedSeqRef.current = currentSeq;
          setStoredResponse({ token: accessToken, data });
          setError(null);
        }
      } catch (err: unknown) {
        if (
          !abortController.signal.aborted &&
          currentSeq === sequenceRef.current
        ) {
          if (
            err instanceof EmployeeApiError &&
            (err.status === 401 || err.status === 403 || err.status === 404)
          ) {
            setStoredResponse({ token: null, data: null });
          }
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (
          !abortController.signal.aborted &&
          currentSeq === sequenceRef.current
        ) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      abortController.abort();
    };
  }, [status, accessToken, apiClient]);

  useEffect(() => {
    if (status !== "authenticated") {
      return undefined;
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadContext(false);
      }
    };

    const onOnline = () => {
      void loadContext(false);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [status, loadContext]);

  const refresh = useCallback(async (): Promise<void> => {
    await loadContext(false);
  }, [loadContext]);

  const revalidateOnAuthLoss = useCallback(async (): Promise<void> => {
    await loadContext(true);
  }, [loadContext]);

  // Synchronous fail-closed protection:
  // Data is ONLY effective if status is authenticated AND stored token matches current accessToken
  const effectiveResponse =
    status === "authenticated" &&
    accessToken !== null &&
    storedResponse.token === accessToken
      ? storedResponse.data
      : null;

  const resolution = useMemo<OperationalScopeResolution>(() => {
    if (!effectiveResponse) {
      return { kind: "NO_ACTIVE_SHIFT" };
    }
    return resolveOperationalScope(effectiveResponse);
  }, [effectiveResponse]);

  return {
    response: effectiveResponse,
    resolution,
    isLoading: status === "authenticated" ? isLoading : false,
    error: status === "authenticated" ? error : null,
    refresh,
    revalidateOnAuthLoss,
  };
}
