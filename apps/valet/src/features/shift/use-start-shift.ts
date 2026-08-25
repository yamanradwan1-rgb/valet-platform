"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StartShiftResponse } from "@valet/contracts";

import { getDefaultStaffAuthClient, useOptionalStaffAuth } from "../../lib/auth/staff-auth-context";
import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  StartShiftController,
  type StartShiftPhase,
} from "./start-shift-controller";

export interface UseStartShiftOptions {
  readonly client?: EmployeeApiClient | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onStarted?: ((result: StartShiftResponse) => void) | undefined;
}

export interface UseStartShiftResult {
  readonly phase: StartShiftPhase;
  readonly resetStartShift: () => void;
  readonly retryUncertain: () => void;
  readonly startShift: (targetLocationId: string) => void;
}

export function useStartShift(
  options: UseStartShiftOptions = {},
): UseStartShiftResult {
  const { client: customClient, onAuthorizationLoss, onStarted } = options;
  const auth = useOptionalStaffAuth();
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

  const [phase, setPhase] = useState<StartShiftPhase>({ kind: "idle" });

  const [controller] = useState(
    () => new StartShiftController({ apiClient, onStateChange: setPhase }),
  );

  useEffect(() => {
    controller.activate(setPhase);
  }, [controller]);

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  useEffect(() => {
    controller.setOnStarted(onStarted);
  }, [controller, onStarted]);

  const startShift = useCallback(
    (targetLocationId: string) => {
      controller.submit(targetLocationId);
    },
    [controller],
  );

  const retryUncertain = useCallback(() => {
    controller.retry();
  }, [controller]);

  const resetStartShift = useCallback(() => {
    controller.reset();
  }, [controller]);

  return { phase, resetStartShift, retryUncertain, startShift };
}
