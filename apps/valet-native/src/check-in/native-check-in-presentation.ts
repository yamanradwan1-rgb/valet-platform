import type {
  EmployeeCheckInSnapshot,
  EmployeeOperationalFailure,
} from "@valet/employee-client";

import type { NativeCheckInCopy } from "./native-check-in-copy";
import { employeeTextStyle } from "../employee-ui/employee-typography";

export type NativeCapturePresentation = "camera" | "manual" | "descriptor";

export function initialCheckInCapturePresentation(
  snapshot: EmployeeCheckInSnapshot,
): NativeCapturePresentation {
  if (
    snapshot.vehicle.mode === "TEMPORARY_DESCRIPTOR" &&
    snapshot.vehicle.temporaryDescriptor !== ""
  )
    return "descriptor";
  return snapshot.vehicle.plateNumberRaw === "" ? "camera" : "manual";
}

export function checkInHeaderTitle(
  copy: NativeCheckInCopy,
  snapshot: EmployeeCheckInSnapshot,
  presentation: NativeCapturePresentation,
  continuationTitle?: string,
  conditionTitle?: string,
): string {
  if (snapshot.phase === "capture") {
    if (presentation === "manual") return copy.enterPlate;
    if (presentation === "descriptor") return copy.temporaryDescriptor;
    return copy.scanPlate;
  }
  if (snapshot.phase === "confirm") {
    return snapshot.vehicle.mode === "CONFIRMED_PLATE"
      ? copy.confirmPlate
      : copy.confirmDescription;
  }
  if (snapshot.phase === "returning") return copy.vehicleFound;
  if (snapshot.phase === "vehicle-details") return copy.vehicleDetails;
  if (snapshot.phase === "customer") return copy.customerContact;
  if (snapshot.phase === "recoverables") return copy.recoverableSessions;
  if (snapshot.phase === "discovering" || snapshot.phase === "discovery-error")
    return copy.discoveryTitle;
  if (snapshot.phase === "recognizing") return copy.recognizingTitle;
  if (snapshot.phase === "submitting") return copy.submittingTitle;
  if (snapshot.phase === "intake-ambiguous") return copy.intakeUnknownTitle;
  if (snapshot.phase === "created") {
    const mode = snapshot.continuation?.mode;
    if (
      conditionTitle !== undefined &&
      (mode === "select-condition" ||
        mode === "ambiguous" ||
        mode === "boundary")
    ) {
      return conditionTitle;
    }
    return continuationTitle ?? copy.vehicleDetails;
  }
  if (snapshot.phase === "continuation") return copy.parkingTask;
  return copy.title;
}

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
  continuationMode?: EmployeeCheckInSnapshot["continuation"]["mode"],
): boolean {
  return (
    phase === "submitting" ||
    phase === "recognizing" ||
    (phase === "created" &&
      [
        "submitting",
        "reconciling",
        "ambiguous",
        "condition-completed",
      ].includes(continuationMode ?? "view"))
  );
}

export function checkInTextStyle(
  kind: "identifier" | "human",
  textAlign: "left" | "right",
) {
  return employeeTextStyle(kind, textAlign);
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
