import { reconcileEmployeeEndRecovery } from "./employee-shift-end-recovery";
import type { EndShiftResponse } from "@valet/contracts";
import { EmployeeApiError } from "./api-error";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";
import { endPresenceTarget } from "./employee-shift-presence-target";
import {
  employeeShiftEndAuthorityKey,
  normalizeEmployeeShiftCash,
  validateEmployeeShiftEndResult,
} from "./employee-shift-end-state";
import type {
  EmployeeShiftEndAuthority,
  EmployeeShiftEndSessionOptions,
  EmployeeShiftEndSnapshot,
  EmployeeShiftEndOutcome,
} from "./employee-shift-end-types";

export interface EndAttempt {
  readonly authority: EmployeeShiftEndAuthority;
  readonly cashReported: string;
  readonly workflowGeneration: number;
  operationId?: string | undefined;
}

export async function executeEmployeeEndAttempt(
  options: EmployeeShiftEndSessionOptions,
  attempt: EndAttempt,
): Promise<EmployeeShiftEndOutcome> {
  try {
    const result =
      options.presence === undefined
        ? await options.transport.endShift(
            attempt.authority.shiftId,
            attempt.cashReported,
          )
        : await runEndPresence(options.presence, attempt);

    validateEmployeeShiftEndResult(
      attempt.authority,
      attempt.cashReported,
      result,
    );
    return { result, failure: null, phase: "ended" as const };
  } catch (error) {
    const recovered = options.presence?.recoveryOutcome();
    if (recovered !== undefined)
      return reconcileEmployeeEndRecovery(options, attempt, recovered);
    const phase: EmployeeShiftEndSnapshot["phase"] = isAmbiguousMutationFailure(
      error,
    )
      ? "uncertain"
      : error instanceof EmployeeApiError &&
          error.code === "OPEN_TASK_HANDOFF_REQUIRED"
        ? "blocked-open-work"
        : "error";
    return { result: null, failure: operationalFailure(error), phase };
  }
}

export function isCurrentEndAttempt(
  attempt: EndAttempt,
  pending: EndAttempt | undefined,
  snapshot: EmployeeShiftEndSnapshot,
  workflowGeneration: number,
): boolean {
  return (
    pending === attempt &&
    workflowGeneration === attempt.workflowGeneration &&
    snapshot.authority !== null &&
    employeeShiftEndAuthorityKey(snapshot.authority) ===
      employeeShiftEndAuthorityKey(attempt.authority)
  );
}

export function confirmedEndAttempt(
  snapshot: EmployeeShiftEndSnapshot,
  workflowGeneration: number,
): EndAttempt | undefined {
  if (
    snapshot.authority === null ||
    !snapshot.online ||
    snapshot.phase !== "confirming"
  )
    return;
  return {
    authority: snapshot.authority,
    cashReported: normalizeEmployeeShiftCash(snapshot.cashInput),
    workflowGeneration,
  };
}

async function runEndPresence(
  presence: NonNullable<EmployeeShiftEndSessionOptions["presence"]>,
  attempt: EndAttempt,
): Promise<EndShiftResponse> {
  const operation = presence.run(
    endPresenceTarget(attempt.authority, attempt.cashReported),
  );
  attempt.operationId = presence.descriptor()?.operationId;
  return (await operation) as EndShiftResponse;
}
