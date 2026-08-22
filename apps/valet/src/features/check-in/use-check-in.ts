"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  StaffCheckInContinuationSummary,
  StaffCheckInDraftSummary,
} from "@valet/contracts";

import { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  getDefaultStaffAuthClient,
  useOptionalStaffAuth,
} from "../../lib/auth/staff-auth-context";
import { CheckInController } from "./check-in-controller";
import type {
  CheckInActiveSession,
  CheckInFlowStep,
  CheckInState,
  CheckInVehicleData,
  StartParkingPayload,
} from "./check-in-types";

export interface UseCheckInOptions {
  readonly client?: EmployeeApiClient | undefined;
  readonly locationId: string | null;
  readonly onAuthorizationLoss?: (() => void) | undefined;
}

export interface UseCheckInResult {
  readonly activeSession: CheckInActiveSession | null;
  readonly assignKey: (keySlotCode: string) => Promise<void>;
  readonly completeCondition: (conditionNote?: string) => Promise<void>;
  readonly confirmPlate: (vehicleData: CheckInVehicleData) => Promise<void>;
  readonly continuations: StaffCheckInContinuationSummary[];
  readonly createParkingTask: () => Promise<void>;
  readonly drafts: StaffCheckInDraftSummary[];
  readonly error: string | null;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly pendingVehicle: CheckInVehicleData | null;
  readonly resumeContinuation: (
    continuation: StaffCheckInContinuationSummary,
  ) => Promise<void>;
  readonly resumeDraft: (draft: StaffCheckInDraftSummary) => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly setStep: (step: CheckInFlowStep) => void;
  readonly startParking: () => Promise<StartParkingPayload | null>;
  readonly step: CheckInFlowStep;
  readonly submitCustomerPhone: (phone: string) => Promise<void>;
}

export function useCheckIn(options: UseCheckInOptions): UseCheckInResult {
  const { locationId, client: customClient, onAuthorizationLoss } = options;
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

  const [controllerState, setControllerState] = useState<CheckInState>({
    activeSession: null,
    continuations: [],
    drafts: [],
    error: null,
    isHydrating: locationId !== null,
    isSubmitting: false,
    pendingVehicle: null,
    step: locationId ? "discovery" : "plate-scan",
  });

  const [controller] = useState(
    () =>
      new CheckInController(apiClient, (nextState) => {
        setControllerState(nextState);
      }),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  useEffect(() => {
    if (locationId) {
      void controller.initialize(locationId);
    } else {
      controller.setStep("plate-scan");
    }
  }, [controller, locationId]);

  const confirmPlate = useCallback(
    async (vehicleData: CheckInVehicleData) => {
      await controller.confirmPlate(vehicleData);
    },
    [controller],
  );

  const submitCustomerPhone = useCallback(
    async (phone: string) => {
      if (locationId) {
        await controller.submitCustomerPhone(locationId, phone);
      }
    },
    [controller, locationId],
  );

  const completeCondition = useCallback(
    async (conditionNote?: string) => {
      await controller.completeCondition(conditionNote);
    },
    [controller],
  );

  const assignKey = useCallback(
    async (keySlotCode: string) => {
      await controller.assignKey(keySlotCode);
    },
    [controller],
  );

  const createParkingTask = useCallback(async () => {
    await controller.createParkingTask();
  }, [controller]);

  const startParking = useCallback(async () => {
    return controller.startParking();
  }, [controller]);

  const resumeDraft = useCallback(
    async (draft: StaffCheckInDraftSummary) => {
      if (locationId) {
        await controller.hydrateFromDraft(locationId, draft);
      }
    },
    [controller, locationId],
  );

  const resumeContinuation = useCallback(
    async (continuation: StaffCheckInContinuationSummary) => {
      if (locationId) {
        await controller.hydrateFromContinuation(locationId, continuation);
      }
    },
    [controller, locationId],
  );

  const retry = useCallback(async () => {
    if (locationId) {
      await controller.initialize(locationId);
    }
  }, [controller, locationId]);

  const setStep = useCallback(
    (step: CheckInFlowStep) => {
      controller.setStep(step);
    },
    [controller],
  );

  return {
    activeSession: controllerState.activeSession,
    assignKey,
    completeCondition,
    confirmPlate,
    continuations: controllerState.continuations,
    createParkingTask,
    drafts: controllerState.drafts,
    error: controllerState.error,
    isHydrating: controllerState.isHydrating,
    isSubmitting: controllerState.isSubmitting,
    pendingVehicle: controllerState.pendingVehicle,
    resumeContinuation,
    resumeDraft,
    retry,
    setStep,
    startParking,
    step: controllerState.step,
    submitCustomerPhone,
  };
}
