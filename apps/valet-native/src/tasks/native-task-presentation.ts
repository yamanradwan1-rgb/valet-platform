import {
  type EmployeeOperationalSnapshot,
  type StaffTaskQueueItem,
  isEmployeeMutationUnresolved,
} from "@valet/employee-client";

import type { FoundationLocale } from "../foundation/foundation-locale";
import type { NativeTasksCopy } from "./native-tasks-copy";

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

export function canOpenNativeParkingTask(
  snapshot: EmployeeOperationalSnapshot,
  task: StaffTaskQueueItem,
): boolean {
  return (
    snapshot.phase === "ready" &&
    task.taskType === "PARKING" &&
    (task.status === "ACCEPTED" || task.status === "IN_PROGRESS") &&
    task.currentAssigneeMembershipId === snapshot.scope?.membershipId &&
    !isEmployeeMutationUnresolved(snapshot.mutation)
  );
}

export function canOpenNativeRetrievalTask(
  snapshot: EmployeeOperationalSnapshot,
  task: StaffTaskQueueItem,
): boolean {
  return (
    snapshot.phase === "ready" &&
    task.taskType === "RETRIEVAL" &&
    (task.status === "ACCEPTED" || task.status === "IN_PROGRESS") &&
    task.currentAssigneeMembershipId === snapshot.scope?.membershipId &&
    !isEmployeeMutationUnresolved(snapshot.mutation)
  );
}

export function canOpenNativeHandoffOverride(
  snapshot: EmployeeOperationalSnapshot,
  task: StaffTaskQueueItem,
): boolean {
  return (
    snapshot.phase === "ready" &&
    snapshot.scope?.role === "VALET_SUPERVISOR" &&
    task.taskType === "RETRIEVAL" &&
    task.status === "IN_PROGRESS" &&
    task.valetSessionState === "HANDOFF_PENDING" &&
    task.currentAssigneeMembershipId !== null &&
    task.currentAssigneeMembershipId !== snapshot.scope.membershipId &&
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
  if (task.status === "ASSIGNED")
    return task.taskType === "PARKING" ? copy.acceptAndPark : copy.acceptTask;
  if (task.taskType === "PARKING" && task.status === "ACCEPTED")
    return copy.startParking;
  if (task.taskType === "PARKING" && task.status === "IN_PROGRESS")
    return copy.continueParking;
  if (task.taskType === "RETRIEVAL" && task.status === "ACCEPTED")
    return copy.openRetrieval;
  if (task.taskType === "RETRIEVAL" && task.status === "IN_PROGRESS")
    return copy.continueRetrieval;
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

function fallbackRelativeMinutes(
  locale: FoundationLocale,
  minutes: number,
): string {
  if (locale === "en") {
    return minutes === 0 ? "this minute" : `${minutes} min. ago`;
  }
  if (minutes === 0) return "هذه الدقيقة";
  if (minutes === 1) return "قبل دقيقة واحدة";
  if (minutes === 2) return "قبل دقيقتين";
  const remainder = minutes % 100;
  return `قبل ${minutes} ${remainder >= 3 && remainder <= 10 ? "دقائق" : "دقيقة"}`;
}

export function nativeTaskTime(
  copy: NativeTasksCopy,
  locale: FoundationLocale,
  task: StaffTaskQueueItem,
  now = Date.now(),
): string {
  const timestamp = task.retrievalRequestedAt ?? task.createdAt;
  const minutes = Math.floor(Math.max(0, now - Date.parse(timestamp)) / 60_000);
  const relative =
    typeof Intl !== "undefined" && typeof Intl.RelativeTimeFormat === "function"
      ? new Intl.RelativeTimeFormat(locale, {
          numeric: "auto",
          style: "short",
        }).format(-minutes, "minute")
      : fallbackRelativeMinutes(locale, minutes);
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
