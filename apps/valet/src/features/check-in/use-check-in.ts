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
}

export interface UseCheckInResult {
  readonly activeSession: CheckInActiveSession | null;
  readonly assignKey: (keySlotCode: string) => Promise<void>;
  readonly completeCondition: () => Promise<void>;
  readonly confirmPlate: (vehicleData: CheckInVehicleData) => Promise<void>;
  readonly continuations: StaffCheckInContinuationSummary[];
  readonly createParkingTask: () => Promise<void>;
  readonly drafts: StaffCheckInDraftSummary[];
  readonly error: string | null;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly resumeContinuation: (
    continuation: StaffCheckInContinuationSummary,
  ) => Promise<void>;
  readonly resumeDraft: (draft: StaffCheckInDraftSummary) => Promise<void>;
  readonly saveCustomerPhone: (phone: string) => void;
  readonly setStep: (step: CheckInFlowStep) => void;
  readonly startFresh: () => void;
  readonly startParking: () => Promise<StartParkingPayload | null>;
  readonly step: CheckInFlowStep;
}

export function useCheckIn(options: UseCheckInOptions): UseCheckInResult {
  const { locationId, client: customClient } = options;
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

  const [controllerState, setControllerState] = useState<CheckInState>({
    activeSession: null,
    continuations: [],
    drafts: [],
    error: null,
    isHydrating: locationId !== null,
    isSubmitting: false,
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
      if (locationId) {
        await controller.confirmPlate(locationId, vehicleData);
      }
    },
    [controller, locationId],
  );

  const saveCustomerPhone = useCallback(
    (phone: string) => {
      controller.saveCustomerPhone(phone);
    },
    [controller],
  );

  const completeCondition = useCallback(async () => {
    await controller.completeCondition();
  }, [controller]);

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

  const startFresh = useCallback(() => {
    controller.startFresh();
  }, [controller]);

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
    resumeContinuation,
    resumeDraft,
    saveCustomerPhone,
    setStep,
    startFresh,
    startParking,
    step: controllerState.step,
  };
}
