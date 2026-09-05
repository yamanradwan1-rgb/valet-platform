import type { StaffTaskQueueItem } from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type {
  EmployeeAcceptAttempt,
  EmployeeOperationalFailure,
  EmployeeOperationalSnapshot,
  EmployeeOperationalScope,
} from "./employee-operational-types";

export type ReconciledAcceptPhase = "accepted" | "conflict" | "retry-available";

export function employeeQueueActionKind(
  task: StaffTaskQueueItem | undefined,
  membershipId: string | undefined,
): "accept" | "claim-and-accept" | null {
  if (task?.status === "QUEUED" && task.currentAssigneeMembershipId === null) {
    return "claim-and-accept";
  }
  if (
    task?.status === "ASSIGNED" &&
    task.currentAssigneeMembershipId === membershipId
  ) {
    return "accept";
  }
  return null;
}

export function createEmployeeQueueAttempt(
  snapshot: EmployeeOperationalSnapshot,
  generation: number | null,
  taskId: string,
): EmployeeAcceptAttempt | undefined {
  const scope = snapshot.scope;
  const task = snapshot.tasks.find((item) => item.taskId === taskId);
  const kind = employeeQueueActionKind(task, scope?.membershipId);
  if (
    generation === null ||
    scope === null ||
    task === undefined ||
    snapshot.phase !== "ready" ||
    kind === null
  ) {
    return undefined;
  }
  return {
    assigneeMembershipId: scope.membershipId,
    expectedVersion: task.version,
    generation,
    kind,
    locationId: scope.locationId,
    shiftId: scope.shiftId,
    taskId,
  };
}

export function isEmployeeAttemptScope(
  attempt: EmployeeAcceptAttempt | undefined,
  generation: number | null,
  scope: EmployeeOperationalScope | null,
): boolean {
  return (
    scope !== null &&
    attempt?.generation === generation &&
    attempt.assigneeMembershipId === scope.membershipId &&
    attempt.locationId === scope.locationId &&
    attempt.shiftId === scope.shiftId
  );
}

export function operationalFailure(error: unknown): EmployeeOperationalFailure {
  if (error instanceof EmployeeApiError) {
    return {
      code: error.code,
      message: error.message,
      retryAfter: error.retryAfter,
      status: error.status,
    };
  }
  return {
    code: "OPERATIONAL_STATE_UNAVAILABLE",
    message:
      error instanceof Error
        ? error.message
        : "Operational state is unavailable.",
  };
}

export function isAmbiguousMutationFailure(error: unknown): boolean {
  return (
    error instanceof EmployeeApiError &&
    (error.isNetworkError ||
      error.status === 408 ||
      (error.status >= 500 && error.status <= 599))
  );
}

export function reconcileAcceptAttempt(input: {
  readonly assigneeMembershipId: string;
  readonly expectedVersion: number;
  readonly kind?: "accept" | "claim-and-accept";
  readonly task: StaffTaskQueueItem | undefined;
}): ReconciledAcceptPhase {
  if (
    input.task?.status === "ACCEPTED" &&
    input.task.currentAssigneeMembershipId === input.assigneeMembershipId &&
    input.task.version ===
      input.expectedVersion + (input.kind === "claim-and-accept" ? 2 : 1)
  ) {
    return "accepted";
  }
  if (
    input.task?.status === "ASSIGNED" &&
    input.task.currentAssigneeMembershipId === input.assigneeMembershipId &&
    (input.task.version === input.expectedVersion ||
      (input.kind === "claim-and-accept" &&
        input.task.version === input.expectedVersion + 1))
  ) {
    return "retry-available";
  }
  if (
    input.kind === "claim-and-accept" &&
    input.task?.status === "QUEUED" &&
    input.task.currentAssigneeMembershipId === null &&
    input.task.version === input.expectedVersion
  ) {
    return "retry-available";
  }
  return "conflict";
}
