import type { ActiveShiftOverviewEntry, ManagementLocation } from "@valet/contracts";

import type { SelectedDashboardScope } from "../../../components/scope";
import type { DashboardLocale } from "../../../lib/i18n/locale";
import { administrationCopy } from "../administration-copy";

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

export function staffShiftDetailLabels(
  items: readonly ActiveShiftOverviewEntry[],
  location: Pick<ManagementLocation, "name" | "timezone">,
  locale: DashboardLocale,
): readonly string[] {
  const t = administrationCopy(locale);
  const separator = locale === "ar" ? "، " : ", ";
  const isolate = (value: string) =>
    locale === "ar" ? `\u2068${value}\u2069` : value;
  const baseLabels = items.map((item) =>
    `${t.details}: ${isolate(location.name)}${separator}${t.startedAt} ${isolate(
      formatStaffTime(item.startedAt, location.timezone, locale),
    )}`);
  const counts = new Map<string, number>();
  for (const label of baseLabels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const number = new Intl.NumberFormat(locale === "ar" ? "ar-JO" : "en-GB");
  return baseLabels.map((label, index) =>
    (counts.get(label) ?? 0) > 1
      ? `${label}${separator}${t.row} ${number.format(index + 1)}`
      : label);
}
