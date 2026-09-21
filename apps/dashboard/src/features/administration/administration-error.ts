import { DashboardApiError, dashboardApiDisplayMessage } from "../../lib/api/dashboard-api-error";

export function administrationErrorMessage(reason: unknown): string {
  if (reason instanceof DashboardApiError) {
    if (reason.code === "AUTH_RECONCILED_RETRY_REQUIRED") return reason.message;
    return reason.message || dashboardApiDisplayMessage(reason.kind);
  }
  return reason instanceof Error ? reason.message : "The request could not be completed.";
}

export function isConflict(reason: unknown): reason is DashboardApiError {
  return reason instanceof DashboardApiError && reason.kind === "conflict";
}

export function isMfaRequired(reason: unknown): reason is DashboardApiError {
  return reason instanceof DashboardApiError && reason.kind === "mfa";
}
