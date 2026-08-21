"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StaffOperationalContextResponse } from "@valet/contracts";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import {
  StaffOperationalContextController,
  type StaffOperationalContextState,
} from "./staff-operational-context-controller";
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

  const apiClient = useMemo(
    () =>
      customApiClient ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
      }),
    [customApiClient, authClient],
  );

  const [controllerState, setControllerState] =
    useState<StaffOperationalContextState>({
      response: null,
      isLoading: false,
      error: null,
    });

  const [controller] = useState(
    () =>
      new StaffOperationalContextController({
        apiClient,
        onStateChange: (nextState) => {
          setControllerState(nextState);
        },
      }),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  useEffect(() => {
    controller.setAuth(status, accessToken);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        controller.handleVisibilityChange(true);
      } else {
        controller.handleVisibilityChange(false);
      }
    };

    const onOnline = () => {
      controller.handleOnline();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
    };
  }, [controller, status, accessToken]);

  useEffect(() => {
    return () => {
      controller.destroy();
    };
  }, [controller]);

  const refresh = useCallback(async (): Promise<void> => {
    await controller.refresh();
  }, [controller]);

  const revalidateOnAuthLoss = useCallback(async (): Promise<void> => {
    await controller.revalidateOnAuthLoss();
  }, [controller]);

  // Synchronous fail-closed protection
  const effectiveResponse =
    status === "authenticated" && accessToken ? controllerState.response : null;

  const resolution = useMemo<OperationalScopeResolution>(() => {
    if (!effectiveResponse) {
      return { kind: "NO_ACTIVE_SHIFT" };
    }
    return resolveOperationalScope(effectiveResponse);
  }, [effectiveResponse]);

  return {
    response: effectiveResponse,
    resolution,
    isLoading: status === "authenticated" ? controllerState.isLoading : false,
    error: status === "authenticated" ? controllerState.error : null,
    refresh,
    revalidateOnAuthLoss,
  };
}
