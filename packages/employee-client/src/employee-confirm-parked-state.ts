import type {
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
  TaskQueueResponse,
} from "@valet/contracts";

import type { EmployeeOperationalScope } from "./employee-operational-types";
import { EmployeeApiError } from "./api-error";
import {
  parseResourceQr,
  type QrResourceKind,
  type QrResourcePayload,
} from "./qr-resource-payload";
import type {
  EmployeeConfirmParkedConflict,
  EmployeeConfirmParkedPhase,
  EmployeeConfirmParkedSnapshot,
  EmployeeConfirmParkedSuccess,
} from "./employee-confirm-parked-types";

export interface EmployeeConfirmParkedTarget {
  readonly identityGeneration: number;
  readonly locationId: string;
  readonly membershipId: string;
  readonly organizationId: string;
  readonly sessionId: string;
  readonly shiftId: string;
  readonly taskId: string;
}

export const confirmParkedConflictCodes: Readonly<
  Record<string, EmployeeConfirmParkedConflict>
> = {
  KEY_CUSTODY_NOT_READY: "slot",
  PARKING_SPOT_NOT_FOUND_OR_UNAVAILABLE: "spot",
  VERSION_CONFLICT: "stale",
  INVALID_STATE_TRANSITION: "authority",
  TASK_INVALID_STATE: "authority",
  TASK_NOT_FOUND_OR_FORBIDDEN: "authority",
};

export function classifyConfirmParkedFailure(
  error: unknown,
): EmployeeConfirmParkedConflict | null {
  return error instanceof EmployeeApiError
    ? (confirmParkedConflictCodes[error.code] ?? null)
    : null;
}

export function emptyConfirmParkedSnapshot(
  identityGeneration: number | null = null,
  scope: EmployeeOperationalScope | null = null,
  phase: EmployeeConfirmParkedPhase = "inactive",
): EmployeeConfirmParkedSnapshot {
  return {
    conflict: null,
    failure: null,
    identityGeneration,
    keySlotCandidate: "",
    keySlotResourceId: null,
    parked: null,
    parkingSpotCandidate: "",
    parkingSpotResourceId: null,
    phase,
    scope,
    session: null,
    task: null,
  };
}

export function confirmParkedScanCandidate(
  kind: QrResourceKind,
  payload: unknown,
): QrResourcePayload | null {
  const result = parseResourceQr(payload, kind);
  return result.ok ? result.payload : null;
}

export function withConfirmParkingSpotCandidate(
  snapshot: EmployeeConfirmParkedSnapshot,
  value: string,
  resourceId: string | null,
): EmployeeConfirmParkedSnapshot {
  return {
    ...snapshot,
    conflict: null,
    failure: null,
    keySlotCandidate: "",
    keySlotResourceId: null,
    parkingSpotCandidate: value.trim(),
    parkingSpotResourceId: resourceId,
  };
}

export function withConfirmKeySlotCandidate(
  snapshot: EmployeeConfirmParkedSnapshot,
  value: string,
  resourceId: string | null,
): EmployeeConfirmParkedSnapshot {
  const candidate = value.trim();
  return {
    ...snapshot,
    conflict: null,
    failure: null,
    keySlotCandidate: candidate,
    keySlotResourceId: resourceId,
    phase: candidate === "" ? "slot" : "ready",
  };
}

export function backToConfirmParkingSpot(
  snapshot: EmployeeConfirmParkedSnapshot,
): EmployeeConfirmParkedSnapshot {
  return {
    ...snapshot,
    conflict: null,
    failure: null,
    keySlotCandidate: "",
    keySlotResourceId: null,
    phase: "spot",
  };
}

export function hasConfirmParkedPendingWork(
  hasTarget: boolean,
  hasRead: boolean,
  hasCommand: boolean,
): boolean {
  return hasTarget && (hasRead || hasCommand);
}

export function findCurrentParkingTask(
  queue: TaskQueueResponse,
  target: EmployeeConfirmParkedTarget,
): StaffTaskQueueItem | undefined {
  return queue.tasks.find(
    (task) =>
      task.taskId === target.taskId &&
      task.sessionId === target.sessionId &&
      task.taskType === "PARKING",
  );
}

export function isActiveParkingCanonical(
  target: EmployeeConfirmParkedTarget,
  task: StaffTaskQueueItem | undefined,
  session: StaffValetSessionDetailResponse,
): task is StaffTaskQueueItem {
  return (
    task !== undefined &&
    task.currentAssigneeMembershipId === target.membershipId &&
    task.status === "IN_PROGRESS" &&
    task.valetSessionState === "PARKING" &&
    task.valetSessionVersion === session.version &&
    session.sessionId === target.sessionId &&
    session.locationId === target.locationId &&
    session.state === "PARKING" &&
    session.parking.parkingStartedAt !== null &&
    session.parking.parkedAt === null &&
    session.parking.parkingSpotCode === null
  );
}

export function recoveredParkedResult(
  target: EmployeeConfirmParkedTarget,
  task: StaffTaskQueueItem | undefined,
  session: StaffValetSessionDetailResponse,
  spot: string,
  slot: string,
): EmployeeConfirmParkedSuccess | null {
  const canonicalSpot = session.parking.parkingSpotCode;
  const canonicalSlot = session.keySlot?.code ?? null;
  if (
    task !== undefined ||
    session.sessionId !== target.sessionId ||
    session.locationId !== target.locationId ||
    session.state !== "PARKED" ||
    session.parking.parkingStartedAt === null ||
    session.parking.parkedAt === null ||
    canonicalSpot === null ||
    canonicalSlot === null ||
    (spot !== "" && canonicalSpot !== spot) ||
    (slot !== "" && canonicalSlot !== slot)
  ) {
    return null;
  }
  return {
    keySlotCode: canonicalSlot,
    parkedAt: session.parking.parkedAt,
    parkingSpotCode: canonicalSpot,
    sessionVersion: session.version,
    source: "reconciliation",
  };
}

export function phaseAfterActiveRead(
  previous: EmployeeConfirmParkedPhase,
  conflict: EmployeeConfirmParkedConflict | null,
  spot: string,
  slot: string,
): EmployeeConfirmParkedPhase {
  if (conflict === "spot") return "spot";
  if (conflict === "slot") return "slot";
  if (previous === "loading") return "spot";
  if (spot === "") return "spot";
  return slot === "" ? "slot" : "ready";
}

export function targetMatches(
  snapshot: EmployeeConfirmParkedSnapshot,
  target: EmployeeConfirmParkedTarget,
): boolean {
  return (
    snapshot.identityGeneration === target.identityGeneration &&
    snapshot.scope?.organizationId === target.organizationId &&
    snapshot.scope.membershipId === target.membershipId &&
    snapshot.scope.locationId === target.locationId &&
    snapshot.scope.shiftId === target.shiftId
  );
}

export function reconcileConfirmParkedSnapshot(
  snapshot: EmployeeConfirmParkedSnapshot,
  target: EmployeeConfirmParkedTarget,
  queue: TaskQueueResponse,
  session: StaffValetSessionDetailResponse,
  previous: EmployeeConfirmParkedPhase,
  conflict: EmployeeConfirmParkedConflict | null,
): EmployeeConfirmParkedSnapshot {
  const sessionParkingTasks = queue.tasks.filter(
    (item) =>
      item.taskType === "PARKING" && item.sessionId === target.sessionId,
  );
  const task =
    sessionParkingTasks.length === 1
      ? findCurrentParkingTask(queue, target)
      : undefined;
  const parked =
    sessionParkingTasks.length === 0
      ? recoveredParkedResult(
          target,
          task,
          session,
          snapshot.parkingSpotCandidate,
          snapshot.keySlotCandidate,
        )
      : null;
  if (parked !== null) {
    return {
      ...snapshot,
      conflict: null,
      failure: null,
      parked,
      phase: "parked",
      session,
      task: null,
    };
  }
  if (!isActiveParkingCanonical(target, task, session)) {
    const inconsistent = session.state === "PARKED";
    return {
      ...snapshot,
      conflict: inconsistent ? "inconsistent" : "authority",
      phase: inconsistent ? "ambiguous" : "unavailable",
      session,
      task: task ?? null,
    };
  }
  const spot = conflict === "spot" ? "" : snapshot.parkingSpotCandidate;
  const slot =
    conflict === "spot" || conflict === "slot" ? "" : snapshot.keySlotCandidate;
  return {
    ...snapshot,
    conflict,
    keySlotCandidate: slot,
    keySlotResourceId:
      conflict === "spot" || conflict === "slot"
        ? null
        : snapshot.keySlotResourceId,
    parked: null,
    parkingSpotCandidate: spot,
    parkingSpotResourceId:
      conflict === "spot" ? null : snapshot.parkingSpotResourceId,
    phase: phaseAfterActiveRead(previous, conflict, spot, slot),
    session,
    task,
  };
}
