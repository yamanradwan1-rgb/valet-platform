import type { EndShiftResponse } from "@valet/contracts";
import { EmployeeApiError } from "./api-error";
import {
  isAmbiguousMutationFailure,
  operationalFailure,
} from "./employee-operational-recovery";
import { endPresenceTarget } from "./employee-shift-presence-target";
import { validateEmployeeShiftEndResult } from "./employee-shift-end-state";
import type {
  EmployeeShiftEndAuthority,
  EmployeeShiftEndSessionOptions,
  EmployeeShiftEndSnapshot,
} from "./employee-shift-end-types";

export interface EndAttempt {
  readonly authority: EmployeeShiftEndAuthority;
  readonly cashReported: string;
  readonly workflowGeneration: number;
}

export async function executeEmployeeEndAttempt(
  options: EmployeeShiftEndSessionOptions,
  attempt: EndAttempt,
) {
  try {
    const result =
      options.presence === undefined
        ? await options.transport.endShift(
            attempt.authority.shiftId,
            attempt.cashReported,
          )
        : ((await options.presence.run(
            endPresenceTarget(attempt.authority, attempt.cashReported),
          )) as EndShiftResponse);
    validateEmployeeShiftEndResult(
      attempt.authority,
      attempt.cashReported,
      result,
    );
    return { result, failure: null, phase: "ended" as const };
  } catch (error) {
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
