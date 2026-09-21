import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { TranslationKey } from "../../lib/i18n/dictionaries";

export function mfaErrorKey(error: unknown): TranslationKey {
  if (!(error instanceof DashboardApiError)) return "mfaErrorGeneric";
  if (error.code === "MFA_VERIFICATION_FAILED") return "mfaErrorVerification";
  if (error.code === "MFA_RATE_LIMITED") return "mfaErrorRateLimited";
  if (error.code === "MFA_ENROLLMENT_NOT_AVAILABLE") return "mfaErrorStateChanged";
  if (error.code === "AUTH_STATE_CHANGED") return "mfaErrorSession";

  switch (error.kind) {
    case "auth":
      return "mfaErrorSession";
    case "authorization":
    case "entitlement":
      return "mfaErrorAuthorization";
    case "network":
      return "mfaErrorNetwork";
    case "malformed":
      return "mfaErrorInvalidResponse";
    default:
      return "mfaErrorGeneric";
  }
}

export function isUncertainMfaMutation(error: unknown): boolean {
  if (!(error instanceof DashboardApiError)) return false;
  return (
    error.kind === "network" ||
    error.kind === "malformed" ||
    error.kind === "unknown" ||
    error.code === "AUTH_STATE_CHANGED"
  );
}

export function shouldReconcileMfaMutation(error: unknown): boolean {
  return (
    isUncertainMfaMutation(error) ||
    (error instanceof DashboardApiError &&
      (error.kind === "auth" || error.code === "MFA_ENROLLMENT_NOT_AVAILABLE"))
  );
}
