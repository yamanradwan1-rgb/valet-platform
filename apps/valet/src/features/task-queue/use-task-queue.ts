"use client";

import { useEffect, useMemo, useState } from "react";
import type { StaffTaskQueueItem } from "@valet/contracts";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import {
  TaskQueueController,
  type TaskQueueState,
} from "./task-queue-controller";
import { selectEffectiveTaskQueueItems } from "./task-queue-selectors";

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
  const sessionGeneration = auth?.sessionGeneration ?? 0;
  const authClient = auth?.client;

  const apiClient = useMemo(
    () =>
      customClient ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
      }),
    [customClient, authClient],
  );

  const [controllerState, setControllerState] = useState<TaskQueueState>({
    sessionGeneration: null,
    scopeLocationId: null,
    tasks: [],
    isLoading: false,
    isRefreshing: false,
    isHardStopped: false,
    error: null,
  });

  const [controller] = useState(
    () =>
      new TaskQueueController({
        apiClient,
        pollingIntervalMs,
        onAuthorizationLoss,
        onStateChange: (nextState) => {
          setControllerState(nextState);
        },
      }),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
    controller.setOnAuthorizationLoss(onAuthorizationLoss);
  }, [controller, apiClient, onAuthorizationLoss]);

  useEffect(() => {
    controller.setScope(status, sessionGeneration, locationId);

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

    const onOffline = () => {
      controller.handleOffline();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [controller, status, sessionGeneration, locationId]);

  useEffect(() => {
    return () => {
      controller.destroy();
    };
  }, [controller]);

  // Synchronous pre-effect render gating bound to exact sessionGeneration and scopeLocationId
  const effectiveTasks = selectEffectiveTaskQueueItems(
    status,
    sessionGeneration,
    locationId,
    controllerState,
  );

  return {
    tasks: effectiveTasks,
    isLoading:
      status === "authenticated" && locationId
        ? controllerState.isLoading
        : false,
    isRefreshing:
      status === "authenticated" && locationId
        ? controllerState.isRefreshing
        : false,
    isHardStopped: controllerState.isHardStopped,
    error:
      status === "authenticated" && locationId ? controllerState.error : null,
  };
}
