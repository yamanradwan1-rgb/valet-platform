"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import { HandoffController } from "./handoff-controller";
import type { HandoffState } from "./handoff-types";

export interface UseHandoffOptions {
  readonly client?: EmployeeApiClient | undefined;
  readonly onComplete?: (() => void) | undefined;
}

export interface UseHandoffResult {
  readonly state: HandoffState;
  readonly abort: (sessionId: string, reason: string) => Promise<boolean>;
  readonly complete: (sessionId: string) => Promise<boolean>;
  readonly controller: HandoffController;
  readonly initiate: (
    sessionId: string,
    expectedSessionVersion: number,
  ) => Promise<boolean>;
  readonly override: (
    sessionId: string,
    reason: string,
  ) => Promise<boolean>;
  readonly verifyDynamicQr: (
    sessionId: string,
    qrPayload: string,
  ) => Promise<boolean>;
  readonly verifyPickupCode: (
    sessionId: string,
    pickupCode: string,
  ) => Promise<boolean>;
}

export function useHandoff(options: UseHandoffOptions = {}): UseHandoffResult {
  const auth = useOptionalStaffAuth();
  const authClient = auth?.client;

  const apiClient = useMemo(
    () =>
      options.client ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
      }),
    [options.client, authClient],
  );

  const [controllerState, setControllerState] = useState<HandoffState>({
    error: null,
    errorMeta: { code: null, retryAfterSeconds: null },
    phase: "idle",
    sessionVersion: null,
    verification: null,
  });

  const [controller] = useState(
    () =>
      new HandoffController({
        apiClient,
        onComplete: options.onComplete,
        onStateChange: setControllerState,
      }),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  const initiate = useCallback(
    async (
      sessionId: string,
      expectedSessionVersion: number,
    ): Promise<boolean> => controller.initiate(sessionId, expectedSessionVersion),
    [controller],
  );

  const verifyPickupCode = useCallback(
    async (sessionId: string, pickupCode: string): Promise<boolean> =>
      controller.verifyPickupCode(sessionId, pickupCode),
    [controller],
  );

  const verifyDynamicQr = useCallback(
    async (sessionId: string, qrPayload: string): Promise<boolean> =>
      controller.verifyDynamicQr(sessionId, qrPayload),
    [controller],
  );

  const override = useCallback(
    async (sessionId: string, reason: string): Promise<boolean> =>
      controller.supervisorOverride(sessionId, reason),
    [controller],
  );

  const abort = useCallback(
    async (sessionId: string, reason: string): Promise<boolean> =>
      controller.abort(sessionId, reason),
    [controller],
  );

  const complete = useCallback(
    async (sessionId: string): Promise<boolean> =>
      controller.complete(sessionId),
    [controller],
  );

  return {
    abort,
    complete,
    controller,
    initiate,
    override,
    state: controllerState,
    verifyDynamicQr,
    verifyPickupCode,
  };
}
