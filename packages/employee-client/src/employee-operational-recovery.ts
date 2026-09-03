import type { StaffTaskQueueItem } from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeOperationalFailure } from "./employee-operational-types";

export type ReconciledAcceptPhase = "accepted" | "conflict" | "retry-available";

export function operationalFailure(error: unknown): EmployeeOperationalFailure {
  if (error instanceof EmployeeApiError) {
    return { code: error.code, message: error.message };
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
  readonly task: StaffTaskQueueItem | undefined;
}): ReconciledAcceptPhase {
  if (
    input.task?.status === "ACCEPTED" &&
    input.task.currentAssigneeMembershipId === input.assigneeMembershipId &&
    input.task.version === input.expectedVersion + 1
  ) {
    return "accepted";
  }
  if (
    input.task?.status === "ASSIGNED" &&
    input.task.currentAssigneeMembershipId === input.assigneeMembershipId &&
    input.task.version === input.expectedVersion
  ) {
    return "retry-available";
  }
  return "conflict";
}
