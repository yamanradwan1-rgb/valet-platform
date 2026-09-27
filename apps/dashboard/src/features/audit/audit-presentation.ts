import type { ManagementAuditEvent } from "@valet/contracts";
import type { SelectedDashboardScope } from "../../components/scope";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { selectedOperationsLocation } from "../operations/operations-location";

export function auditTimeContext(selected: SelectedDashboardScope) {
  const location = selectedOperationsLocation(selected);
  if (location)
    return {
      locationId: location.locationId,
      name: location.name,
      timezone: location.timezone,
    };
  if (selected.authority === "SUPERVISOR") {
    return {
      locationId: selected.context.location.locationId,
      name: selected.context.location.name,
      timezone: "UTC",
    };
  }
  return { locationId: null, name: null, timezone: "UTC" };
}

export type AuditTimeContext = ReturnType<typeof auditTimeContext>;

export function auditScopeLabel(
  event: ManagementAuditEvent,
  context: AuditTimeContext,
  locale: DashboardLocale,
) {
  if (event.scope.kind === "ORGANIZATION")
    return locale === "ar" ? "المؤسسة" : "Organization";
  if (event.scope.locationId === context.locationId && context.name)
    return context.name;
  return locale === "ar" ? "الموقع" : "Location";
}

export function formatAuditTime(
  value: string,
  timezone: string,
  locale: DashboardLocale,
): string {
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return locale === "ar" ? "الوقت غير متاح" : "Time unavailable";
  }
}
