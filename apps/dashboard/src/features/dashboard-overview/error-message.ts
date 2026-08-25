import type { DashboardApiError } from "../../lib/api/api-error";
import type { TranslationKey } from "../../i18n/translations/types";

/**
 * Resolves the honest user-facing message key for an overview failure.
 *
 * - authorization-masked: backend masks denial as NOT_FOUND; the surface
 *   states that the account has no access without revealing more.
 * - network errors get their own guidance.
 * - everything else (server, validation, rate limit) uses one generic
 *   message; no mock data ever replaces the failed request.
 */
export function overviewErrorMessageKey(
  error: DashboardApiError | null,
): TranslationKey {
  if (error === null) return "states.errorGeneric";
  if (error.kind === "authorization-masked") return "states.accessDenied";
  if (error.isNetworkError) return "states.networkError";
  return "states.errorGeneric";
}
