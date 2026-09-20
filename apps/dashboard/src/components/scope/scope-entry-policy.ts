import { DashboardApiError } from "../../lib/api/dashboard-api-error";

export type ScopeEntrySource = "COMPANY_ADMIN" | "LOCATION_MANAGER" | "SUPERVISOR";
export type ScopeSourceFailureDisposition = "EMPTY" | "MFA_REQUIRED" | "ERROR";

export function scopeSourceFailureDisposition(
  source: ScopeEntrySource,
  error: unknown,
): ScopeSourceFailureDisposition {
  if (!(error instanceof DashboardApiError)) return "ERROR";
  if (source === "COMPANY_ADMIN" && error.kind === "mfa") return "MFA_REQUIRED";
  if (error.kind === "authorization") return "EMPTY";
  return "ERROR";
}
