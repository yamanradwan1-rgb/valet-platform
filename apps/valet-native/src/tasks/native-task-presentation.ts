import {
  type EmployeeOperationalFailure,
  type EmployeeOperationalSnapshot,
  type StaffTaskQueueItem,
  isEmployeeMutationUnresolved,
} from "@valet/employee-client";

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
  const timestamp = task.retrievalRequestedAt ?? task.createdAt;
  const seconds = Math.max(0, Math.floor((now - Date.parse(timestamp)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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
