import { EmployeeApiError } from "@valet/employee-client";
import type { IntakeCustomerIntent } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  applyVehicleDetailsCorrection,
  createRecognizedIntake,
  isVehicleDetailsConflict,
  recognizedVehicleData,
  rehydrateCreatedSession,
  runVehicleRecognition,
} from "./check-in-returning-mutations";
import type {
  CheckInVehicleData,
  CheckInVehicleDetailsDraft,
  CheckInState,
} from "./check-in-types";

export interface ReturningCheckInActionContext {
  readonly client: EmployeeApiClient;
  readonly clearIntakeOperationId: () => void;
  readonly getIntakeOperationId: () => string;
  readonly getState: () => CheckInState;
  readonly update: (patch: Partial<CheckInState>) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function recognizePreIntakeVehicle(
  context: ReturningCheckInActionContext,
  locationId: string,
  vehicle: CheckInVehicleData,
): Promise<void> {
  context.clearIntakeOperationId();
  context.update({
    correctionConflict: false,
    customerOrigin: "plate-confirm",
    customerResolved: false,
    error: null,
    pendingCorrection: null,
    pendingCorrectionExpectedAt: null,
    pendingVehicle: vehicle,
    recognizedVehicle: null,
    recognitionFailed: false,
  });
  if (vehicle.temporaryDescriptor !== null) {
    context.update({
      customerOrigin: "vehicle-details",
      step: "vehicle-details",
    });
    return;
  }
  context.update({ isSubmitting: true });
  try {
    const recognized = await runVehicleRecognition(
      context.client,
      locationId,
      vehicle,
    );
    if (recognized === null) {
      context.update({
        customerOrigin: "vehicle-details",
        isSubmitting: false,
        pendingVehicle: vehicle,
        recognizedVehicle: null,
        step: "vehicle-details",
      });
      return;
    }
    context.update({
      customerOrigin: "returning-vehicle",
      isSubmitting: false,
      pendingCorrectionExpectedAt: recognized.vehicleUpdatedAt,
      pendingVehicle: recognizedVehicleData(recognized),
      recognizedVehicle: recognized,
      step: "returning-vehicle",
    });
  } catch (error: unknown) {
    context.update({
      error: errorMessage(error, "Failed to recognize vehicle."),
      isSubmitting: false,
      pendingVehicle: vehicle,
      recognitionFailed: true,
    });
  }
}

export function setVehicleDetailDraft(
  context: ReturningCheckInActionContext,
  details: CheckInVehicleDetailsDraft,
  temporaryDescriptor?: string,
): void {
  const pending = context.getState().pendingVehicle;
  if (!pending) return;
  context.update({
    customerOrigin: "vehicle-details",
    pendingVehicle: {
      ...pending,
      ...details,
      ...(pending.temporaryDescriptor === null
        ? {}
        : { temporaryDescriptor: temporaryDescriptor?.trim() || null }),
    },
    step: "customer-phone",
  });
}

export function setKnownVehicleCorrection(
  context: ReturningCheckInActionContext,
  details: CheckInVehicleDetailsDraft,
): void {
  const state = context.getState();
  context.update({
    correctionConflict: false,
    error: null,
    pendingCorrection: details,
    pendingVehicle: state.pendingVehicle
      ? { ...state.pendingVehicle, ...details }
      : null,
    recognizedVehicle: state.recognizedVehicle
      ? { ...state.recognizedVehicle, ...details }
      : null,
  });
}

async function correctPendingDetails(
  context: ReturningCheckInActionContext,
): Promise<void> {
  const state = context.getState();
  const { activeSession, pendingCorrection, pendingCorrectionExpectedAt } =
    state;
  if (!activeSession || !pendingCorrection || !pendingCorrectionExpectedAt) {
    context.update({ pendingVehicle: null, step: "vehicle-condition" });
    return;
  }
  context.update({ error: null, isSubmitting: true });
  try {
    const corrected = await applyVehicleDetailsCorrection(
      context.client,
      activeSession,
      pendingCorrection,
      pendingCorrectionExpectedAt,
    );
    context.update({
      activeSession: corrected,
      isSubmitting: false,
      pendingCorrection: null,
      pendingCorrectionExpectedAt: null,
      pendingVehicle: null,
      step: "vehicle-condition",
    });
  } catch (error: unknown) {
    if (isVehicleDetailsConflict(error)) {
      const current = await rehydrateCreatedSession(
        context.client,
        activeSession,
      );
      const recognized = context.getState().recognizedVehicle;
      context.update({
        activeSession: current,
        correctionConflict: true,
        error: null,
        isSubmitting: false,
        pendingCorrection: null,
        pendingCorrectionExpectedAt: current.vehicleUpdatedAt,
        pendingVehicle: current.vehicle,
        recognizedVehicle: recognized
          ? {
              ...recognized,
              ...current.vehicle,
              vehicleUpdatedAt:
                current.vehicleUpdatedAt ?? recognized.vehicleUpdatedAt,
            }
          : null,
        step: "returning-vehicle",
      });
      return;
    }
    context.update({
      error: errorMessage(error, "Failed to correct vehicle details."),
      isSubmitting: false,
      step: "returning-vehicle",
    });
  }
}

export async function continueResolvedCheckIn(
  context: ReturningCheckInActionContext,
): Promise<void> {
  if (context.getState().pendingCorrection) {
    await correctPendingDetails(context);
    return;
  }
  context.update({
    error: null,
    pendingVehicle: null,
    step: "vehicle-condition",
  });
}

export async function createPreIntakeSession(
  context: ReturningCheckInActionContext,
  locationId: string,
  customer: IntakeCustomerIntent | undefined,
): Promise<void> {
  const state = context.getState();
  if (state.isSubmitting || state.activeSession) return;
  if (!state.pendingVehicle) {
    context.update({ error: "No vehicle captured.", step: "plate-scan" });
    return;
  }
  context.update({ error: null, isSubmitting: true });
  try {
    const activeSession = await createRecognizedIntake(
      context.client,
      locationId,
      state.pendingVehicle,
      customer,
      context.getIntakeOperationId(),
      state.recognizedVehicle !== null,
    );
    context.clearIntakeOperationId();
    context.update({
      activeSession,
      customerResolved: true,
      isSubmitting: false,
    });
    await continueResolvedCheckIn(context);
  } catch (error: unknown) {
    context.update({
      error: errorMessage(error, "Failed to create vehicle intake."),
      errorCode:
        error instanceof EmployeeApiError && error.code === "LOCATION_INTAKE_STOPPED"
          ? error.code
          : null,
      isSubmitting: false,
    });
  }
}
