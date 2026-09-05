import { EmployeeApiError } from "./api-error";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";
import type {
  EmployeeAcceptAttempt,
  EmployeeOperationalFailure,
  EmployeeOperationalTransport,
} from "./employee-operational-types";

export type EmployeeTaskActionResult =
  | { readonly kind: "reconcile" }
  | { readonly kind: "stale" }
  | {
      readonly failure: EmployeeOperationalFailure;
      readonly kind: "failed";
    };

export async function executeEmployeeTaskAction(
  attempt: EmployeeAcceptAttempt,
  transport: EmployeeOperationalTransport,
  isCurrent: () => boolean,
): Promise<EmployeeTaskActionResult> {
  let assignmentCommitted = false;
  try {
    let expectedVersion = attempt.expectedVersion;
    if (attempt.kind === "claim-and-accept") {
      const assigned = await transport.assignTask(
        attempt.taskId,
        expectedVersion,
      );
      if (!isCurrent()) return { kind: "stale" };
      if (
        assigned.taskId !== attempt.taskId ||
        assigned.status !== "ASSIGNED" ||
        assigned.currentAssigneeMembershipId !== attempt.assigneeMembershipId ||
        assigned.version !== expectedVersion + 1
      ) {
        return { kind: "reconcile" };
      }
      assignmentCommitted = true;
      expectedVersion = assigned.version;
    }
    await transport.acceptTask(attempt.taskId, expectedVersion);
    return isCurrent() ? { kind: "reconcile" } : { kind: "stale" };
  } catch (error) {
    if (!isCurrent()) return { kind: "stale" };
    if (
      error instanceof EmployeeApiError &&
      (assignmentCommitted ||
        error.code === "VERSION_CONFLICT" ||
        isAmbiguousMutationFailure(error))
    ) {
      return { kind: "reconcile" };
    }
    return { failure: operationalFailure(error), kind: "failed" };
  }
}
