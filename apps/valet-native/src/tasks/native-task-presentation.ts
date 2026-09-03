import {
  type EmployeeOperationalScope,
  type EmployeeOperationalSnapshot,
  type StaffTaskQueueItem,
  isEmployeeMutationUnresolved,
} from "@valet/employee-client";

import type { NativeTasksCopy } from "./native-tasks-copy";

export function nativeOperationalFacts(scope: EmployeeOperationalScope) {
  return {
    location: `${scope.locationName} (${scope.locationCode})`,
    organization: scope.organizationName,
    role: scope.role,
    shift: scope.shiftStartedAt,
  };
}

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

export function canAcceptNativeTask(
  snapshot: EmployeeOperationalSnapshot,
  task: StaffTaskQueueItem,
): boolean {
  return (
    snapshot.phase === "ready" &&
    task.taskType === "PARKING" &&
    task.status === "ASSIGNED" &&
    task.currentAssigneeMembershipId === snapshot.scope?.membershipId &&
    !isEmployeeMutationUnresolved(snapshot.mutation)
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
