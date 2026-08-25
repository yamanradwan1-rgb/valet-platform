import type { TranslationKey } from "../../i18n/translations/types";
import { DashboardApiError } from "./api-error";

/**
 * Maps normalized transport failures onto typed, user-safe message keys.
 * Raw backend error codes and messages are never rendered; every failure kind
 * resolves to a friendly, already-translated surface.
 */
export function apiErrorMessageKey(error: unknown): TranslationKey {
  if (!(error instanceof DashboardApiError)) return "errors.requestFailed";
  switch (error.kind) {
    case "session-expired":
      return "errors.sessionExpired";
    case "forbidden":
    case "authorization-masked":
      return "errors.accessDenied";
    case "rate-limited":
      return "errors.rateLimited";
    default:
      return "errors.requestFailed";
  }
}
