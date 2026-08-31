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
  readonly client?: EmployeeApiClient | undefined;
  readonly locationId: string | null;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly pollingIntervalMs?: number | undefined;
}

export interface UseTaskQueueResult {
  readonly client: EmployeeApiClient;
  readonly error: Error | null;
  readonly isHardStopped: boolean;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly refresh: () => Promise<void>;
  readonly successfulSnapshotCount: number;
  readonly tasks: StaffTaskQueueItem[];
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
        onAuthorizationLoss,
      }),
    [customClient, authClient, onAuthorizationLoss],
  );

  const [controllerState, setControllerState] = useState<TaskQueueState>({
    error: null,
    isHardStopped: false,
    isLoading: false,
    isRefreshing: false,
    scopeLocationId: null,
    sessionGeneration: null,
    successfulSnapshotCount: 0,
    tasks: [],
  });

  const [controller] = useState(
    () =>
      new TaskQueueController({
        apiClient,
        onAuthorizationLoss,
        onStateChange: (nextState) => {
          setControllerState(nextState);
        },
        pollingIntervalMs,
      }),
  );

  useEffect(() => {
    controller.activate(setControllerState);
    return () => {
      controller.destroy();
    };
  }, [controller]);

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

  // Synchronous pre-effect render gating bound to exact sessionGeneration and scopeLocationId
  const effectiveTasks = selectEffectiveTaskQueueItems(
    status,
    sessionGeneration,
    locationId,
    controllerState,
  );

  return {
    client: apiClient,
    error:
      status === "authenticated" && locationId ? controllerState.error : null,
    isHardStopped: controllerState.isHardStopped,
    isLoading:
      status === "authenticated" && locationId
        ? controllerState.isLoading
        : false,
    isRefreshing:
      status === "authenticated" && locationId
        ? controllerState.isRefreshing
        : false,
    refresh: () => controller.refresh(),
    successfulSnapshotCount:
      status === "authenticated" &&
      locationId !== null &&
      controllerState.sessionGeneration === sessionGeneration &&
      controllerState.scopeLocationId === locationId &&
      !controllerState.isLoading
        ? (controllerState.successfulSnapshotCount ?? 0)
        : 0,
    tasks: effectiveTasks,
  };
}
