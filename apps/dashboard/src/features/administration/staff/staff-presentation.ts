import type { ManagementLocation } from "@valet/contracts";

import type { SelectedDashboardScope } from "../../../components/scope";
import type { DashboardLocale } from "../../../lib/i18n/locale";

export function selectedStaffLocation(
  selectedScope: SelectedDashboardScope,
): ManagementLocation | null {
  if (selectedScope.authority === "COMPANY_ADMIN") {
    return selectedScope.context.selectedLocation;
  }
  if (selectedScope.authority === "LOCATION_MANAGER") {
    return selectedScope.location;
  }
  return null;
}

export function formatStaffTime(
  value: string,
  timezone: string,
  locale: DashboardLocale,
): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-JO" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone,
    }).format(instant);
  } catch {
    return "—";
  }
}
