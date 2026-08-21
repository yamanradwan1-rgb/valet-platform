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
import { selectEffectiveOperationalResponse } from "./staff-operational-context-selectors";

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
  const sessionGeneration = auth?.sessionGeneration ?? 0;
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
      sessionGeneration: null,
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
    controller.setAuth(status, accessToken, sessionGeneration);

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
  }, [controller, status, accessToken, sessionGeneration]);

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

  // Synchronous pre-effect render gating bound to exact sessionGeneration
  const effectiveResponse = selectEffectiveOperationalResponse(
    status,
    accessToken,
    sessionGeneration,
    controllerState,
  );

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
