import type { SelectedDashboardScope } from "../../components/scope";

export type DashboardPeriodPreset =
  | "TODAY"
  | "LAST_2_DAYS"
  | "LAST_3_DAYS"
  | "LAST_7_DAYS"
  | "LAST_14_DAYS"
  | "LAST_30_DAYS";

export const dashboardPeriodPresets: readonly DashboardPeriodPreset[] = [
  "TODAY",
  "LAST_2_DAYS",
  "LAST_3_DAYS",
  "LAST_7_DAYS",
  "LAST_14_DAYS",
  "LAST_30_DAYS",
];

const presetDays: Record<DashboardPeriodPreset, number> = {
  TODAY: 1,
  LAST_2_DAYS: 2,
  LAST_3_DAYS: 3,
  LAST_7_DAYS: 7,
  LAST_14_DAYS: 14,
  LAST_30_DAYS: 30,
};

export function scopeCalendarTimezone(
  scope: SelectedDashboardScope,
): string | null {
  if (scope.authority === "COMPANY_ADMIN") {
    return (
      scope.context.selectedLocation?.timezone ??
      scope.context.organization.timezone
    );
  }
  if (scope.authority === "LOCATION_MANAGER") return scope.location.timezone;
  return null;
}

export function civilDateAt(now: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    numberingSystem: "latn",
    timeZone: timezone,
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new Error("Calendar date unavailable.");
  return `${year}-${month}-${day}`;
}

export function addCivilDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day!));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function resolvePeriodPreset(
  now: number,
  timezone: string,
  preset: DashboardPeriodPreset,
): { readonly from: string; readonly to: string } {
  return resolvePeriodPresetFromCivilDate(civilDateAt(now, timezone), preset);
}

export function resolvePeriodPresetFromCivilDate(
  to: string,
  preset: DashboardPeriodPreset,
): { readonly from: string; readonly to: string } {
  return { from: addCivilDays(to, 1 - presetDays[preset]), to };
}

export function currentReportSelector(
  now: number,
  timezone: string,
  kind: "DAILY" | "WEEKLY" | "MONTHLY",
) {
  const today = civilDateAt(now, timezone);
  if (kind === "DAILY") return { kind, date: today } as const;
  if (kind === "MONTHLY") return { kind, month: today.slice(0, 7) } as const;
  const [year, month, day] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  return {
    kind,
    weekStart: addCivilDays(today, -((weekday + 6) % 7)),
  } as const;
}
