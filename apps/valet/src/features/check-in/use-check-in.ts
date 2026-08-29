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
  CheckInCustomerOrigin,
  CheckInFlowStep,
  CheckInState,
  CheckInVehicleData,
  CheckInVehicleDetailsDraft,
  RecognizedCheckInVehicle,
  StartParkingPayload,
} from "./check-in-types";

export interface UseCheckInOptions {
  readonly client?: EmployeeApiClient | undefined;
  readonly locationId: string | null;
  readonly membershipId?: string | null | undefined;
  readonly onAuthorizationLoss?: (() => void) | undefined;
}

export interface UseCheckInResult {
  readonly activeSession: CheckInActiveSession | null;
  readonly completeCondition: (conditionNote?: string) => Promise<void>;
  readonly continueAfterCustomerResolution: () => Promise<void>;
  readonly continueToCustomer: (
    origin: "returning-vehicle" | "vehicle-details",
  ) => void;
  readonly continueWithoutRecognition: () => void;
  readonly confirmPlate: (vehicleData: CheckInVehicleData) => Promise<void>;
  readonly continuations: StaffCheckInContinuationSummary[];
  readonly createParkingTask: () => Promise<void>;
  readonly drafts: StaffCheckInDraftSummary[];
  readonly error: string | null;
  readonly correctionConflict: boolean;
  readonly customerOrigin: CheckInCustomerOrigin;
  readonly customerResolved: boolean;
  readonly isHydrating: boolean;
  readonly isSubmitting: boolean;
  readonly pendingVehicle: CheckInVehicleData | null;
  readonly pendingCorrection: CheckInVehicleDetailsDraft | null;
  readonly recognizedVehicle: RecognizedCheckInVehicle | null;
  readonly recognitionFailed: boolean;
  readonly resumeContinuation: (
    continuation: StaffCheckInContinuationSummary,
  ) => Promise<void>;
  readonly resumeDraft: (draft: StaffCheckInDraftSummary) => Promise<void>;
  readonly retry: () => Promise<void>;
  readonly setStep: (step: CheckInFlowStep) => void;
  readonly setPendingCorrection: (details: CheckInVehicleDetailsDraft) => void;
  readonly setVehicleDetails: (
    details: CheckInVehicleDetailsDraft,
    temporaryDescriptor?: string,
  ) => void;
  readonly startParking: () => Promise<StartParkingPayload | null>;
  readonly step: CheckInFlowStep;
  readonly submitCustomerPhone: (phone: string) => Promise<void>;
  readonly useSavedCustomer: () => Promise<void>;
}

export function useCheckIn(options: UseCheckInOptions): UseCheckInResult {
  const {
    locationId,
    membershipId,
    client: customClient,
    onAuthorizationLoss,
  } = options;
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
    correctionConflict: false,
    customerOrigin: "plate-confirm",
    customerResolved: false,
    isHydrating: locationId !== null,
    isSubmitting: false,
    pendingCorrection: null,
    pendingCorrectionExpectedAt: null,
    pendingVehicle: null,
    recognizedVehicle: null,
    recognitionFailed: false,
    step: locationId ? "discovery" : "plate-scan",
  });

  const [controller] = useState(
    () =>
      new CheckInController(
        apiClient,
        (nextState) => {
          setControllerState(nextState);
        },
        membershipId,
      ),
  );

  useEffect(() => {
    controller.setApiClient(apiClient);
  }, [controller, apiClient]);

  useEffect(() => {
    controller.setMembershipId(membershipId);
  }, [controller, membershipId]);

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

  const continueWithoutRecognition = useCallback(() => {
    controller.continueWithoutRecognition();
  }, [controller]);

  const continueToCustomer = useCallback(
    (origin: "returning-vehicle" | "vehicle-details") => {
      controller.continueToCustomer(origin);
    },
    [controller],
  );

  const setVehicleDetails = useCallback(
    (details: CheckInVehicleDetailsDraft, descriptor?: string) => {
      controller.setVehicleDetails(details, descriptor);
    },
    [controller],
  );

  const setPendingCorrection = useCallback(
    (details: CheckInVehicleDetailsDraft) => {
      controller.setPendingCorrection(details);
    },
    [controller],
  );

  const useSavedCustomer = useCallback(async () => {
    if (locationId) await controller.useSavedCustomer(locationId);
  }, [controller, locationId]);

  const continueAfterCustomerResolution = useCallback(async () => {
    await controller.continueAfterCustomerResolution();
  }, [controller]);

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

  const createParkingTask = useCallback(async () => {
    await controller.createParkingTask();
  }, [controller]);

  const startParking = useCallback(async () => {
    return controller.startParking(membershipId);
  }, [controller, membershipId]);

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
    completeCondition,
    continueAfterCustomerResolution,
    continueToCustomer,
    continueWithoutRecognition,
    confirmPlate,
    continuations: controllerState.continuations,
    createParkingTask,
    drafts: controllerState.drafts,
    error: controllerState.error,
    correctionConflict: controllerState.correctionConflict,
    customerOrigin: controllerState.customerOrigin,
    customerResolved: controllerState.customerResolved,
    isHydrating: controllerState.isHydrating,
    isSubmitting: controllerState.isSubmitting,
    pendingVehicle: controllerState.pendingVehicle,
    pendingCorrection: controllerState.pendingCorrection,
    recognizedVehicle: controllerState.recognizedVehicle,
    recognitionFailed: controllerState.recognitionFailed,
    resumeContinuation,
    resumeDraft,
    retry,
    setStep,
    setPendingCorrection,
    setVehicleDetails,
    startParking,
    step: controllerState.step,
    submitCustomerPhone,
    useSavedCustomer,
  };
}
