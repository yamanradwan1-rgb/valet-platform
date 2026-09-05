import {
  type EmployeeOperationalFailure,
  type EmployeeOperationalSnapshot,
  type StaffTaskQueueItem,
  isEmployeeMutationUnresolved,
} from "@valet/employee-client";

import type { FoundationLocale } from "../foundation/foundation-locale";
import type { NativeTasksCopy } from "./native-tasks-copy";

export function nativeMutationMessage(
  copy: NativeTasksCopy,
  phase: EmployeeOperationalSnapshot["mutation"]["phase"],
): string | undefined {
  const messages = {
    accepted: copy.accepted,
    conflict: copy.conflict,
    reconciling: copy.reconcile,
    "recovery-unavailable": copy.unknownResult,
    submitting: copy.processing,
  } as const;
  return messages[phase as keyof typeof messages];
}

export function nativeQueueFailureMessage(
  copy: NativeTasksCopy,
  failure: EmployeeOperationalFailure,
  hardStopped: boolean,
  hasRetainedTasks: boolean,
): string {
  if (hardStopped) return copy.accessChanged;
  if (failure.status === 429) return copy.rateLimited;
  return hasRetainedTasks ? copy.stale : copy.error;
}

export function canAcceptNativeTask(
  snapshot: EmployeeOperationalSnapshot,
  task: StaffTaskQueueItem,
): boolean {
  return (
    snapshot.phase === "ready" &&
    ((task.status === "QUEUED" && task.currentAssigneeMembershipId === null) ||
      (task.status === "ASSIGNED" &&
        task.currentAssigneeMembershipId === snapshot.scope?.membershipId)) &&
    !isEmployeeMutationUnresolved(snapshot.mutation)
  );
}

export function nativeTaskActionLabel(
  copy: NativeTasksCopy,
  task: StaffTaskQueueItem,
): string | undefined {
  if (task.status === "QUEUED" && task.currentAssigneeMembershipId === null) {
    return task.taskType === "PARKING"
      ? copy.claimParking
      : copy.claimRetrieval;
  }
  if (task.status === "ASSIGNED") return copy.accept;
  return undefined;
}

export function nativeTaskStatusLabel(
  copy: NativeTasksCopy,
  status: StaffTaskQueueItem["status"],
): string {
  return {
    ACCEPTED: copy.statusAccepted,
    ASSIGNED: copy.statusAssigned,
    IN_PROGRESS: copy.statusInProgress,
    QUEUED: copy.statusQueued,
  }[status];
}

export function nativeTaskTypeLabel(
  copy: NativeTasksCopy,
  type: StaffTaskQueueItem["taskType"],
): string {
  return type === "PARKING" ? copy.parking : copy.retrieval;
}

export function nativeTaskAge(
  task: StaffTaskQueueItem,
  now = Date.now(),
): string {
  const seconds = Math.max(
    0,
    Math.floor((now - Date.parse(task.createdAt)) / 1000),
  );
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function nativeTaskTime(
  copy: NativeTasksCopy,
  locale: FoundationLocale,
  task: StaffTaskQueueItem,
  now = Date.now(),
): string {
  const timestamp = task.retrievalRequestedAt ?? task.createdAt;
  const minutes = Math.floor(Math.max(0, now - Date.parse(timestamp)) / 60_000);
  const relative = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  }).format(-minutes, "minute");
  return `${task.retrievalRequestedAt ? copy.requested : copy.statusQueued} ${relative}`;
}

export function nativeTaskParkingContext(
  task: StaffTaskQueueItem,
): string | null {
  return (
    [task.parkingZone, task.parkingSpot]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" · ") || null
  );
}

export function nativeTaskVehicleLabel(task: StaffTaskQueueItem): string {
  const makeModel = [task.vehicle.make, task.vehicle.model]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" ");
  return (
    makeModel ||
    task.vehicle.temporaryDescriptor?.trim() ||
    task.vehicle.plateNumberRaw?.trim() ||
    task.taskId
  );
}

export function nativeTaskVehicleIdentifier(
  task: StaffTaskQueueItem,
): string | null {
  return (
    task.vehicle.plateNumberRaw?.trim() ||
    task.vehicle.temporaryDescriptor?.trim() ||
    null
  );
}
