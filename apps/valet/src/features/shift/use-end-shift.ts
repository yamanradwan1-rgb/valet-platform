"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EndShiftResponse } from "@valet/contracts";

import { getDefaultStaffAuthClient, useOptionalStaffAuth } from "../../lib/auth/staff-auth-context";
import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  EndShiftController,
  type EndShiftPhase,
} from "./end-shift-controller";

export interface UseEndShiftOptions {
  readonly client?: EmployeeApiClient | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
  readonly onEnded?: ((result: EndShiftResponse) => void) | undefined;
}

export interface UseEndShiftResult {
  readonly endShift: (shiftId: string, cashReported: string) => void;
  readonly phase: EndShiftPhase;
  readonly resetEndShift: () => void;
  readonly retryUncertain: () => void;
}

export function useEndShift(
  options: UseEndShiftOptions = {},
): UseEndShiftResult {
  const { client: customClient, onAuthorizationLoss, onEnded } = options;
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

  const [phase, setPhase] = useState<EndShiftPhase>({ kind: "idle" });

  const [controller] = useState(
    () => new EndShiftController({ apiClient, onStateChange: setPhase }),
  );

  useEffect(() => {
    controller.activate(setPhase);
  }, [controller]);

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  useEffect(() => {
    controller.setOnEnded(onEnded);
  }, [controller, onEnded]);

  const endShift = useCallback(
    (shiftId: string, cashReported: string) => {
      controller.submit(shiftId, cashReported);
    },
    [controller],
  );

  const retryUncertain = useCallback(() => {
    controller.retry();
  }, [controller]);

  const resetEndShift = useCallback(() => {
    controller.reset();
  }, [controller]);

  return { endShift, phase, resetEndShift, retryUncertain };
}
