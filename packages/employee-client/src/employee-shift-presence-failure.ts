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
