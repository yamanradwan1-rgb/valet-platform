import type { IntakeCustomerIntent } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  correctSessionVehicleDetails,
  fetchSessionDetail,
  recognizeReturningVehicle,
} from "./check-in-api";
import { runIntakeMutation } from "./check-in-mutations";
import type {
  CheckInActiveSession,
  CheckInVehicleData,
  CheckInVehicleDetailsDraft,
  RecognizedCheckInVehicle,
} from "./check-in-types";

export async function runVehicleRecognition(
  client: EmployeeApiClient,
  locationId: string,
  vehicle: CheckInVehicleData,
): Promise<RecognizedCheckInVehicle | null> {
  const response = await recognizeReturningVehicle(client, {
    targetLocationId: locationId,
    vehicleIdentity: {
      confirmedByHuman: true,
      mode: "CONFIRMED_PLATE",
      plateCountry: vehicle.plateCountry,
      plateNumberRaw: vehicle.plateNumberRaw,
    },
  });
  return response.vehicle;
}

export function recognizedVehicleData(
  vehicle: RecognizedCheckInVehicle,
): CheckInVehicleData {
  return {
    color: vehicle.color,
    make: vehicle.make,
    model: vehicle.model,
    plateCountry: vehicle.plateCountry,
    plateNumberRaw: vehicle.plateNumberRaw,
    temporaryDescriptor: null,
  };
}

export async function createRecognizedIntake(
  client: EmployeeApiClient,
  locationId: string,
  vehicle: CheckInVehicleData,
  customer: IntakeCustomerIntent | undefined,
  intakeOperationId: string,
  isKnownVehicle: boolean,
): Promise<CheckInActiveSession> {
  return runIntakeMutation(
    client,
    locationId,
    vehicle,
    customer,
    intakeOperationId,
    !isKnownVehicle,
  );
}

export async function applyVehicleDetailsCorrection(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
  details: CheckInVehicleDetailsDraft,
  expectedVehicleUpdatedAt: string,
): Promise<CheckInActiveSession> {
  const response = await correctSessionVehicleDetails(
    client,
    session.sessionId,
    { ...details, expectedVehicleUpdatedAt },
  );
  return {
    ...session,
    vehicle: { ...session.vehicle, ...details },
    vehicleUpdatedAt: response.vehicleUpdatedAt,
  };
}

export function isVehicleDetailsConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "VEHICLE_DETAILS_VERSION_CONFLICT"
  );
}

export async function rehydrateCreatedSession(
  client: EmployeeApiClient,
  session: CheckInActiveSession,
): Promise<CheckInActiveSession> {
  const detail = await fetchSessionDetail(client, session.sessionId);
  return {
    ...session,
    sessionVersion: detail.version,
    vehicle: {
      color: detail.vehicle.color,
      make: detail.vehicle.make,
      model: detail.vehicle.model,
      plateCountry: detail.vehicle.plateCountry ?? "JO",
      plateNumberRaw: detail.vehicle.plateNumberRaw ?? "",
      temporaryDescriptor: detail.vehicle.temporaryDescriptor,
    },
    vehicleUpdatedAt: detail.vehicle.vehicleUpdatedAt,
  };
}
