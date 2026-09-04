import type {
  EmployeeCheckInSnapshot,
  EmployeeOperationalFailure,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";

export function checkInFailureMessage(
  copy: NativeCheckInCopy,
  failure: EmployeeOperationalFailure | null,
): string | null {
  if (failure === null) return null;
  switch (failure.code) {
    case "PLATE_REQUIRED":
      return copy.enterPlate;
    case "TEMPORARY_DESCRIPTOR_REQUIRED":
      return copy.noPlateExample;
    case "CUSTOMER_PHONE_AMBIGUOUS":
      return copy.phoneAmbiguous;
    case "RETURNING_CUSTOMER_INTENT_INVALID":
      return copy.savedCustomerStale;
    case "NETWORK_ERROR":
    case "REQUEST_TIMEOUT":
    case "BAD_GATEWAY":
    case "SERVICE_UNAVAILABLE":
    case "GATEWAY_TIMEOUT":
      return copy.intakeUnknown;
    default:
      return copy.discoveryError;
  }
}

export function checkInBackBlocked(
  phase: EmployeeCheckInSnapshot["phase"],
): boolean {
  return phase === "submitting" || phase === "recognizing";
}

export function checkInTextStyle(
  kind: "identifier" | "human",
  textAlign: "left" | "right",
) {
  return {
    textAlign: kind === "identifier" ? ("left" as const) : textAlign,
    writingDirection:
      kind === "human" && textAlign === "right"
        ? ("rtl" as const)
        : ("ltr" as const),
  };
}

export function checkInIdentityLabel(
  snapshot: EmployeeCheckInSnapshot,
  fallback: string,
): string {
  if (snapshot.active !== null) {
    return (
      snapshot.active.vehicle.plateNumberRaw ??
      snapshot.active.vehicle.temporaryDescriptor ??
      fallback
    );
  }
  return snapshot.vehicle.mode === "CONFIRMED_PLATE"
    ? snapshot.vehicle.plateNumberRaw || fallback
    : snapshot.vehicle.temporaryDescriptor || fallback;
}
