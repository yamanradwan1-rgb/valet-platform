"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import { ParkingController } from "./parking-controller";
import type {
  ActiveParkingSession,
  ParkingFlowStep,
  ParkingState,
} from "./parking-types";

export interface UseParkingOptions {
  readonly client?: EmployeeApiClient | undefined;
  readonly initialSession?: ActiveParkingSession | null | undefined;
  readonly sessionId?: string | null | undefined;
  readonly taskId?: string | null | undefined;
  readonly taskVersion?: number | null | undefined;
}

export interface UseParkingResult {
  readonly activeSession: ActiveParkingSession | null;
  readonly confirmParked: (parkingSpotCode: string) => Promise<void>;
  readonly error: string | null;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly setStep: (step: ParkingFlowStep) => void;
  readonly step: ParkingFlowStep;
}

export function useParking(options: UseParkingOptions): UseParkingResult {
  const {
    initialSession,
    sessionId,
    taskId,
    taskVersion,
    client: customClient,
  } = options;
  const auth = useOptionalStaffAuth();
  const authClient = auth?.client;

  const apiClient = useMemo(
    () =>
      customClient ??
      new EmployeeApiClient({
        authClient: authClient ?? getDefaultStaffAuthClient(),
      }),
    [customClient, authClient],
  );

  const [controllerState, setControllerState] = useState<ParkingState>({
    activeSession: initialSession ?? null,
    error: null,
    isHydrating: !initialSession && Boolean(sessionId && taskId),
    isSubmitting: false,
    step: "in-progress",
  });

  const [controller] = useState(
    () =>
      new ParkingController(apiClient, (nextState) => {
        setControllerState(nextState);
      }),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  useEffect(() => {
    if (initialSession) {
      controller.setActiveSession(initialSession);
    } else if (sessionId && taskId && taskVersion !== null && taskVersion !== undefined) {
      void controller.hydrateSession(sessionId, taskId, taskVersion);
    }
  }, [controller, initialSession, sessionId, taskId, taskVersion]);

  const confirmParked = useCallback(
    async (parkingSpotCode: string) => {
      await controller.confirmParked(parkingSpotCode);
    },
    [controller],
  );

  const setStep = useCallback(
    (step: ParkingFlowStep) => {
      controller.setStep(step);
    },
    [controller],
  );

  return {
    activeSession: controllerState.activeSession,
    confirmParked,
    error: controllerState.error,
    isHydrating: controllerState.isHydrating,
    isSubmitting: controllerState.isSubmitting,
    setStep,
    step: controllerState.step,
  };
}
