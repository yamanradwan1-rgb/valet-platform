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
  const authClient = auth?.client;

  const [response, setResponse] =
    useState<StaffOperationalContextResponse | null>(null);
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

  const activeAbortRef = useRef<AbortController | null>(null);

  const loadContext = useCallback(async (): Promise<void> => {
    if (status !== "authenticated") {
      setResponse(null);
      setError(null);
      return;
    }

    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
    }
    const abortController = new AbortController();
    activeAbortRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchStaffOperationalContext(apiClient, {
        signal: abortController.signal,
      });
      if (!abortController.signal.aborted) {
        setResponse(data);
        setError(null);
      }
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        if (
          err instanceof EmployeeApiError &&
          (err.status === 401 || err.status === 403 || err.status === 404)
        ) {
          // Hard authorization/scope failure: fail closed, clear context
          setResponse(null);
        }
        // For transient errors (network / 500), retain prior valid response
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (!abortController.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [status, apiClient]);

  useEffect(() => {
    if (status === "authenticated") {
      const abortController = new AbortController();
      activeAbortRef.current = abortController;

      const run = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const data = await fetchStaffOperationalContext(apiClient, {
            signal: abortController.signal,
          });
          if (!abortController.signal.aborted) {
            setResponse(data);
            setError(null);
          }
        } catch (err: unknown) {
          if (!abortController.signal.aborted) {
            if (
              err instanceof EmployeeApiError &&
              (err.status === 401 || err.status === 403 || err.status === 404)
            ) {
              setResponse(null);
            }
            setError(err instanceof Error ? err : new Error(String(err)));
          }
        } finally {
          if (!abortController.signal.aborted) {
            setIsLoading(false);
          }
        }
      };

      void run();

      return () => {
        abortController.abort();
      };
    }
    return undefined;
  }, [status, apiClient]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        status === "authenticated"
      ) {
        void loadContext();
      }
    };

    const onOnline = () => {
      if (status === "authenticated") {
        void loadContext();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [status, loadContext]);

  const revalidateOnAuthLoss = useCallback(async (): Promise<void> => {
    // Security wins: immediately invalidate prior scope
    setResponse(null);
    if (status !== "authenticated") {
      setError(null);
      return;
    }
    await loadContext();
  }, [status, loadContext]);

  const effectiveResponse = status === "authenticated" ? response : null;

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
    refresh: loadContext,
    revalidateOnAuthLoss,
  };
}
