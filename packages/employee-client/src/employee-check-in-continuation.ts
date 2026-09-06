import type {
  VehicleDetailsCorrectionResponse,
  VehicleIdentityResponse,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInContinuation,
  EmployeeCheckInCorrectionIntent,
  EmployeeCheckInVehicleDraft,
} from "./employee-check-in-types";

export interface CheckInContinuationValidation<T> {
  readonly error?: { readonly code: string; readonly message: string };
  readonly value?: T;
}

export function continuationForSession(
  active: EmployeeCheckInAuthoritativeSession,
  mode: EmployeeCheckInContinuation["mode"] = "view",
): EmployeeCheckInContinuation {
  const vehicle = active.vehicle;
  return {
    detailsDraft: {
      color: vehicle.color ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
    },
    identityDraft:
      vehicle.plateNumberRaw === null
        ? {
            mode: "TEMPORARY_DESCRIPTOR",
            plateCountry: "JO",
            plateNumberRaw: "",
            temporaryDescriptor: vehicle.temporaryDescriptor ?? "",
          }
        : {
            mode: "CONFIRMED_PLATE",
            plateCountry: vehicle.plateCountry ?? "JO",
            plateNumberRaw: vehicle.plateNumberRaw,
            temporaryDescriptor: "",
          },
    lastMutationKind: null,
    mode,
    pendingIntent: null,
  };
}

function optionalDetail(value: string): string | null {
  const normalized = value.trim().normalize("NFKC");
  return normalized === "" ? null : normalized;
}

export function detailsCorrectionIntent(
  draft: EmployeeCheckInContinuation["detailsDraft"],
  expectedVehicleUpdatedAt: string,
): CheckInContinuationValidation<EmployeeCheckInCorrectionIntent> {
  const details = {
    color: optionalDetail(draft.color),
    make: optionalDetail(draft.make),
    model: optionalDetail(draft.model),
  };
  if (
    Object.values(details).some(
      (value) => value !== null && Array.from(value).length > 80,
    )
  ) {
    return {
      error: {
        code: "VEHICLE_DETAILS_INVALID",
        message: "Vehicle details must be 80 characters or fewer.",
      },
    };
  }
  return {
    value: {
      kind: "DETAILS",
      request: { ...details, expectedVehicleUpdatedAt },
    },
  };
}

export function identityCorrectionIntent(
  draft: EmployeeCheckInVehicleDraft,
  expectedVehicleUpdatedAt: string,
  confirmedByHuman: boolean,
): CheckInContinuationValidation<EmployeeCheckInCorrectionIntent> {
  if (draft.mode === "TEMPORARY_DESCRIPTOR") {
    const temporaryDescriptor = draft.temporaryDescriptor.trim();
    if (
      temporaryDescriptor === "" ||
      Array.from(temporaryDescriptor).length > 160
    ) {
      return {
        error: {
          code: "VEHICLE_IDENTITY_INVALID",
          message: "Enter a vehicle description of 160 characters or fewer.",
        },
      };
    }
    return {
      value: {
        kind: "IDENTITY",
        request: {
          expectedVehicleUpdatedAt,
          identity: { mode: draft.mode, temporaryDescriptor },
        },
      },
    };
  }
  const plateCountry = draft.plateCountry
    .trim()
    .normalize("NFKC")
    .toUpperCase();
  const plateNumberRaw = draft.plateNumberRaw.trim();
  if (
    !/^[A-Z]{2}$/.test(plateCountry) ||
    plateNumberRaw === "" ||
    Array.from(plateNumberRaw).length > 64
  ) {
    return {
      error: {
        code: "VEHICLE_IDENTITY_INVALID",
        message: "Enter a valid plate and two-letter country code.",
      },
    };
  }
  if (!confirmedByHuman) {
    return {
      error: {
        code: "VEHICLE_IDENTITY_CONFIRMATION_REQUIRED",
        message: "Confirm the plate before saving it.",
      },
    };
  }
  return {
    value: {
      kind: "IDENTITY",
      request: {
        expectedVehicleUpdatedAt,
        identity: {
          confirmedByHuman: true,
          mode: draft.mode,
          plateCountry,
          plateNumberRaw,
        },
      },
    },
  };
}

export function applyDetailsCorrection(
  active: EmployeeCheckInAuthoritativeSession,
  response: VehicleDetailsCorrectionResponse,
): EmployeeCheckInAuthoritativeSession {
  return {
    ...active,
    vehicle: {
      ...active.vehicle,
      color: response.color,
      make: response.make,
      model: response.model,
      vehicleUpdatedAt: response.vehicleUpdatedAt,
    },
  };
}

export function applyIdentityCorrection(
  active: EmployeeCheckInAuthoritativeSession,
  response: VehicleIdentityResponse,
): EmployeeCheckInAuthoritativeSession {
  return {
    ...active,
    vehicle: {
      ...active.vehicle,
      plateCountry: response.plateCountry,
      plateNumberRaw: response.plateNumberRaw,
      temporaryDescriptor: response.temporaryDescriptor,
      vehicleUpdatedAt: response.vehicleUpdatedAt,
    },
  };
}

export function authoritativeMatchesCorrection(
  active: EmployeeCheckInAuthoritativeSession,
  intent: EmployeeCheckInCorrectionIntent,
): boolean {
  const vehicle = active.vehicle;
  if (intent.kind === "DETAILS") {
    return (
      vehicle.color === intent.request.color &&
      vehicle.make === intent.request.make &&
      vehicle.model === intent.request.model
    );
  }
  const identity = intent.request.identity;
  return identity.mode === "CONFIRMED_PLATE"
    ? vehicle.plateCountry === identity.plateCountry &&
        vehicle.plateNumberRaw === identity.plateNumberRaw &&
        vehicle.temporaryDescriptor === null
    : vehicle.plateCountry === null &&
        vehicle.plateNumberRaw === null &&
        vehicle.temporaryDescriptor === identity.temporaryDescriptor;
}

export function isCheckInVehicleVersionConflict(error: unknown): boolean {
  return (
    error instanceof EmployeeApiError &&
    (error.code === "VEHICLE_DETAILS_VERSION_CONFLICT" ||
      error.code === "VEHICLE_IDENTITY_VERSION_CONFLICT")
  );
}
