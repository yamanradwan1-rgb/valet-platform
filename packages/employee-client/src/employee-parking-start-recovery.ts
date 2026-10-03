import { EmployeeApiError } from "./api-error";
import type { StartParkingResponse } from "@valet/contracts";
import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import type { EmployeeOperationalScope } from "./employee-operational-types";
import type {
  EmployeeParkingStartPhase,
  EmployeeParkingStartSnapshot,
} from "./employee-parking-start-types";

export interface EmployeeParkingStartTarget {
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly shiftId: string;
  taskId: string | null;
}

export const parkingStartConflictCodes = new Set([
  "INVALID_STATE_TRANSITION",
  "TASK_INVALID_STATE",
  "TASK_NOT_FOUND_OR_FORBIDDEN",
  "VERSION_CONFLICT",
]);

export function parkingStartReadFailurePhase(
  previous: EmployeeParkingStartPhase,
): "ambiguous" | "conflict" | "unavailable" {
  if (previous === "ambiguous") return "ambiguous";
  return previous === "conflict" ? "conflict" : "unavailable";
}

export function emptyParkingStartSnapshot(
  identityGeneration: number | null = null,
  scope: EmployeeOperationalScope | null = null,
  phase: EmployeeParkingStartPhase = "inactive",
): EmployeeParkingStartSnapshot {
  return {
    failure: null,
    identityGeneration,
    phase,
    scope,
    session: null,
    task: null,
  };
}

export function findParkingStartTask(
  queue: TaskQueueResponse,
  target: EmployeeParkingStartTarget,
): StaffTaskQueueItem | undefined {
  return queue.tasks.find(
    (item) =>
      item.taskType === "PARKING" &&
      item.sessionId === target.sessionId &&
      (target.taskId === null || item.taskId === target.taskId),
  );
}

export function classifyParkingStartCanonical(
  target: EmployeeParkingStartTarget,
  task: StaffTaskQueueItem,
  session: StaffValetSessionDetailResponse,
): EmployeeParkingStartPhase {
  const claimable =
    task.status === "QUEUED" && task.currentAssigneeMembershipId === null;
  if (
    session.sessionId !== task.sessionId ||
    session.locationId !== target.locationId ||
    (task.currentAssigneeMembershipId !== target.membershipId && !claimable) ||
    session.version !== task.valetSessionVersion
  ) {
    return "conflict";
  }
  if (
    task.status === "IN_PROGRESS" &&
    session.state === "PARKING" &&
    session.parking.parkingStartedAt !== null
  ) {
    return "started";
  }
  if (
    session.state !== "AWAITING_PARKING" ||
    session.parking.parkingStartedAt !== null
  ) {
    return "conflict";
  }
  if (task.status === "ACCEPTED") return "accepted";
  if (task.status === "ASSIGNED" || task.status === "QUEUED") return "assigned";
  return "conflict";
}

export function isParkingStartTargetCurrent(
  snapshot: EmployeeParkingStartSnapshot,
  target: EmployeeParkingStartTarget,
): boolean {
  return (
    snapshot.identityGeneration === target.identityGeneration &&
    snapshot.scope?.organizationId === target.organizationId &&
    snapshot.scope.membershipId === target.membershipId &&
    snapshot.scope.locationId === target.locationId &&
    snapshot.scope.shiftId === target.shiftId
  );
}

export function assertParkingStartResultMatches(
  result: StartParkingResponse,
  task: StaffTaskQueueItem,
  session: StaffValetSessionDetailResponse,
): void {
  if (result.sessionId !== session.sessionId || result.taskId !== task.taskId)
    throw new EmployeeApiError({
      code: "PARKING_START_RESPONSE_MISMATCH",
      message: "The Parking Start result did not match the current work.",
      status: 502,
    });
}
