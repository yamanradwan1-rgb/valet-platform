import type { CompleteHandoffResponse } from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type { EmployeeReleaseSnapshot } from "./employee-release-flow-types";

export function validateReleaseResult(
  sessionId: string,
  sessionVersion: number,
  taskId: string,
  taskVersion: number,
  result: CompleteHandoffResponse,
) {
  if (
    result.sessionId !== sessionId ||
    result.sessionVersion !== sessionVersion + 1 ||
    result.state !== "COMPLETED" ||
    result.taskId !== taskId ||
    result.taskStatus !== "COMPLETED" ||
    result.taskVersion !== taskVersion + 1 ||
    result.retrievalRequestStatus !== "COMPLETED"
  ) {
    throw new EmployeeApiError({
      code: "RELEASE_RESPONSE_MISMATCH",
      message: "The release result did not match current work.",
      status: 502,
    });
  }
}

export function applyReleaseResult(
  snapshot: EmployeeReleaseSnapshot,
  result: CompleteHandoffResponse,
): EmployeeReleaseSnapshot {
  return {
    ...snapshot,
    block: null,
    completion: result,
    failure: null,
    phase: "released",
    releaseRequiresPayment: null,
    releaseSatisfied: null,
    session: snapshot.session
      ? {
          ...snapshot.session,
          state: result.state,
          version: result.sessionVersion,
        }
      : null,
    task: null,
  };
}
