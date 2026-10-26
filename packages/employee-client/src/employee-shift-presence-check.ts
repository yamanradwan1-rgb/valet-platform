import { EmployeeApiError } from "./api-error";
import { recoverPresence } from "./employee-shift-presence-recovery";
import type { PresenceCheckOutcome } from "./employee-shift-presence-types";
import type {
  PresenceAttempt,
  PresenceWorkflow,
} from "./employee-shift-presence-workflow";

export async function checkPresenceStatus(
  workflow: PresenceWorkflow,
  attempt: PresenceAttempt,
  onFailure: (error: unknown) => void,
): Promise<PresenceCheckOutcome> {
  workflow.publish({ checkStatus: "checking" });
  let status: PresenceCheckOutcome["status"] = "unresolved";
  try {
    await recoverPresence(workflow, attempt);
    status = "committed";
  } catch (error) {
    if (!workflow.current(attempt))
      return { status: "blocked", descriptor: attempt.descriptor };
    onFailure(error);
    status =
      error instanceof EmployeeApiError &&
      error.code === "EXPLICIT_RETRY_REQUIRED"
        ? "not-sent"
        : error instanceof EmployeeApiError &&
            error.code === "PRESENCE_OPERATION_PENDING"
          ? "pending"
          : error instanceof EmployeeApiError && error.status === 429
            ? "rate-limited"
            : "unresolved";
  }
  if (!workflow.current(attempt))
    return { status: "blocked", descriptor: attempt.descriptor };
  const phase = workflow.snapshot().phase;
  const outcome = attempt.recovery ?? {
    status: phase === "pending" || phase === "approved" ? phase : status,
    descriptor: attempt.descriptor,
  };
  workflow.publish({ checkStatus: outcome.status });
  return outcome;
}
