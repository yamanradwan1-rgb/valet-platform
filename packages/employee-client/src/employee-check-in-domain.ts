import type { IntakeRequest, IntakeResponse } from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInVehicleDraft,
} from "./employee-check-in-types";

export interface CheckInVehicleValidation {
  readonly error?: { readonly code: string; readonly message: string };
  readonly vehicle: EmployeeCheckInVehicleDraft;
}

export function validateCheckInVehicle(
  vehicle: EmployeeCheckInVehicleDraft,
): CheckInVehicleValidation {
  if (vehicle.mode === "CONFIRMED_PLATE") {
    const plateCountry = vehicle.plateCountry.trim().toUpperCase();
    if (
      !/^[A-Z]{2}$/.test(plateCountry) ||
      vehicle.plateNumberRaw.trim() === ""
    ) {
      return {
        error: {
          code: "PLATE_REQUIRED",
          message: "Enter a plate and two-letter country code.",
        },
        vehicle,
      };
    }
    return { vehicle: { ...vehicle, plateCountry } };
  }
  if (vehicle.temporaryDescriptor.trim() === "") {
    return {
      error: {
        code: "TEMPORARY_DESCRIPTOR_REQUIRED",
        message: "Describe the vehicle to continue without a plate.",
      },
      vehicle,
    };
  }
  return { vehicle };
}

export function buildCheckInIdentity(
  vehicle: EmployeeCheckInVehicleDraft,
): IntakeRequest["vehicleIdentity"] {
  return vehicle.mode === "CONFIRMED_PLATE"
    ? {
        confirmedByHuman: true,
        mode: "CONFIRMED_PLATE",
        plateCountry: vehicle.plateCountry,
        plateNumberRaw: vehicle.plateNumberRaw,
      }
    : {
        mode: "TEMPORARY_DESCRIPTOR",
        temporaryDescriptor: vehicle.temporaryDescriptor.trim(),
      };
}

export function createdCheckInSession(
  result: IntakeResponse,
  vehicle: EmployeeCheckInVehicleDraft,
): EmployeeCheckInAuthoritativeSession {
  const hasPlate = vehicle.mode === "CONFIRMED_PLATE";
  return {
    sessionId: result.valetSessionId,
    state: "CHECKING_IN",
    vehicle: {
      color: result.color,
      make: result.make,
      model: result.model,
      plateCountry: hasPlate ? vehicle.plateCountry : null,
      plateNumberRaw: hasPlate ? vehicle.plateNumberRaw : null,
      temporaryDescriptor: hasPlate ? null : vehicle.temporaryDescriptor.trim(),
      vehicleId: result.vehicleId,
      vehicleUpdatedAt: result.vehicleUpdatedAt,
    },
  };
}

export function isAmbiguousCheckInFailure(error: unknown): boolean {
  return (
    error instanceof EmployeeApiError &&
    (error.isNetworkError || [408, 502, 503, 504].includes(error.status))
  );
}
