import {
  assertCurrent,
  presenceFailure,
  type PresenceAttempt,
} from "./employee-shift-presence-workflow";
import { EmployeeApiError } from "./api-error";
import type { PresenceWorkflow } from "./employee-shift-presence-workflow";

export function recordPresenceFailure(
  workflow: PresenceWorkflow,
  error: unknown,
): number | null {
  const retryAfter =
    error instanceof EmployeeApiError ? (error.retryAfter ?? null) : null;
  workflow.publish({ retryAfter });
  if (
    ![
      "unavailable",
      "denied",
      "approved",
      "pending",
      "rejected",
      "expired",
    ].includes(workflow.snapshot().phase)
  )
    workflow.publish({ phase: "uncertain" });
  return retryAfter;
}

export function classifyPresenceSubmissionFailure(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
  error: unknown,
): "recover" | "throw" {
  if (!workflow.available() && (attempt.sent || attempt.exceptionSent)) {
    if (workflow.current(attempt)) workflow.publish({ phase: "uncertain" });
    throw presenceFailure();
  }
  if (!workflow.current(attempt)) {
    assertCurrent(workflow, attempt);
  }
  if (
    error instanceof EmployeeApiError &&
    [
      "PRESENCE_REJECTED",
      "PRESENCE_REQUIRED",
      "APPROVER_AUTHORITY_REVOKED",
    ].includes(error.code)
  ) {
    workflow.publish({ phase: "uncertain" });
    return "recover";
  }
  if (
    error instanceof EmployeeApiError &&
    !error.isNetworkError &&
    error.status < 500 &&
    error.status !== 408 &&
    workflow.snapshot().phase !== "unavailable"
  ) {
    attempt.sent = false;
    workflow.publish({
      phase: "unavailable",
      reason: error.code,
      overrideReason: null,
    });
  }
  return "throw";
}
