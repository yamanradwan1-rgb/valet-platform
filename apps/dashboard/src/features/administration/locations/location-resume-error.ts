import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { locationResumeCopy } from "./location-resume-copy";

/** Keep transport/MFA/conflict semantics while localizing this command only. */
export function locationResumeError(error: unknown, locale: DashboardLocale) {
  const t = locationResumeCopy(locale);
  if (!(error instanceof DashboardApiError)) return new Error(t.unknown);
  if (error.kind === "mfa") return error;
  const message =
    error.kind === "conflict"
      ? t.conflict
      : ["authorization", "auth", "entitlement"].includes(error.kind)
        ? t.denied
        : ["network", "malformed"].includes(error.kind) || error.status >= 500
          ? t.unknown
          : t.failure;
  return new DashboardApiError({
    kind: error.kind,
    status: error.status,
    code: error.code,
    requestId: error.requestId ?? undefined,
    message,
    cause: error,
  });
}
