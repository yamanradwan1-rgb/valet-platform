import { DashboardApiError } from "../../../lib/api/dashboard-api-error";

// Only reset issuance has this specific linkless replay/reconciliation rule.
// A gateway or application may commit a write before replying 408 or 5xx.
export function isStaffResetIssueOutcomeAmbiguous(reason: unknown): boolean {
  return reason instanceof DashboardApiError && (
    reason.kind === "network" ||
    reason.kind === "malformed" ||
    reason.status === 408 ||
    (reason.status >= 500 && reason.status <= 599)
  );
}
