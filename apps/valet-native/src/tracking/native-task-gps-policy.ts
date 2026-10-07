import {
  EmployeeApiError,
  type EmployeeGpsPhysicalFix,
} from "@valet/employee-client";

import type {
  NativeTaskLocationAccess,
  NativeTaskLocationFix,
} from "./native-task-location-adapter";
import type {
  NativeTaskTrackingBinding,
  NativeTaskTrackingStatus,
} from "./native-task-tracking-types";

export function nativeTaskGpsPhysicalFix(
  fix: NativeTaskLocationFix,
  binding: NativeTaskTrackingBinding,
  generationStartedAt: number,
  now: number,
): EmployeeGpsPhysicalFix | null {
  if (
    fix.accuracyMeters === null ||
    !Number.isFinite(fix.timestamp) ||
    fix.timestamp < binding.startedAt ||
    fix.timestamp < generationStartedAt ||
    fix.timestamp < now - 300_000 ||
    fix.timestamp > now + 30_000
  ) {
    return null;
  }
  return {
    accuracyMeters: fix.accuracyMeters,
    capturedAt: new Date(fix.timestamp).toISOString(),
    latitude: fix.latitude,
    longitude: fix.longitude,
  };
}

export function nativeTaskTrackingAccessStatus(
  access: Exclude<NativeTaskLocationAccess, { kind: "granted" }>,
): NativeTaskTrackingStatus {
  if (access.kind === "services-disabled") return { kind: "services-disabled" };
  return access.canAskAgain
    ? { kind: "permission-denied" }
    : { kind: "permission-blocked" };
}

export function isRetryableGpsUnknown(error: unknown): boolean {
  return (
    error instanceof EmployeeApiError &&
    (error.isNetworkError ||
      error.status === 0 ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500)
  );
}

export function sameNativeTaskTrackingStatus(
  left: NativeTaskTrackingStatus,
  right: NativeTaskTrackingStatus,
): boolean {
  return (
    left.kind === right.kind &&
    (right.kind !== "active" ||
      (left.kind === "active" && left.taskType === right.taskType))
  );
}
