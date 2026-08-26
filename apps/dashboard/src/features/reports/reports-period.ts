/**
 * Reports period model (framework-free, directly unit-testable).
 *
 * BACKEND OWNERSHIP re-verified for D4-002 in
 * apps/api/src/modules/dashboard/report-period.ts:
 * - DAILY `{date}`: an exact local calendar date (YYYY-MM-DD);
 * - WEEKLY `{weekStart}`: an exact local calendar date that MUST be a
 *   Monday (UTC weekday check server-side);
 * - MONTHLY `{month}`: YYYY-MM with month 01–12.
 * The helpers here mirror those rules for UX gating and sensible defaults
 * only; the backend stays authoritative and any disagreement surfaces as an
 * honest request failure. Location timezone comes from
 * useDashboardLocation().timezone — never the browser timezone presented as
 * fact. Calendar math uses UTC pure-date arithmetic (DST-free), mirroring
 * the backend.
 */

import { isCalendarLocalDate, shiftLocalDate, todayInTimeZone } from "../analytics/analytics-period";

import type { ReportKind } from "@valet/contracts";

const LOCAL_MONTH_PATTERN = /^\d{4}-\d{2}$/u;

export type ReportPeriodErrorKind =
  | "dateFormat"
  | "weekFormat"
  | "weekMonday"
  | "monthFormat";

/** True when the calendar date falls on a Monday (pure-date UTC check). */
export function isMondayLocalDate(value: string): boolean {
  if (!isCalendarLocalDate(value)) return false;
  const millis = Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
  return new Date(millis).getUTCDay() === 1;
}

/** Strict YYYY-MM validity mirroring the backend month resolution. */
export function isCalendarMonthValue(value: string): boolean {
  if (!LOCAL_MONTH_PATTERN.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

/**
 * Mirrors the backend contract for UX gating; null means the value is valid
 * for the requested kind.
 */
export function validateReportPeriodInput(
  kind: ReportKind,
  value: string,
): ReportPeriodErrorKind | null {
  if (kind === "DAILY") {
    return isCalendarLocalDate(value) ? null : "dateFormat";
  }
  if (kind === "WEEKLY") {
    if (!isCalendarLocalDate(value)) return "weekFormat";
    return isMondayLocalDate(value) ? null : "weekMonday";
  }
  return isCalendarMonthValue(value) ? null : "monthFormat";
}

/** Monday of the week containing the given local date (DST-safe). */
export function mondayOfLocalDate(value: string): string {
  const millis = Date.UTC(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
  const weekday = new Date(millis).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return shiftLocalDate(value, -daysSinceMonday);
}

/**
 * Default requested period value per kind: "today" resolved in the
 * LOCATION's configured timezone (weekly snaps back to that day's Monday;
 * monthly truncates to its month). Purely a starting selection.
 */
export function defaultReportPeriodValue(
  kind: ReportKind,
  timeZone: string,
): string {
  const today = todayInTimeZone(timeZone);
  if (kind === "DAILY") return today;
  if (kind === "WEEKLY") return mondayOfLocalDate(today);
  return today.slice(0, 7);
}

/**
 * The period-start date the backend derives for an export request, used
 * ONLY for the truthful fallback download filename (the backend names
 * artifacts `report-{kind}-{periodFrom}.{ext}`). Mirrors
 * apps/api report-period.ts resolution without recomputing any report fact.
 */
export function reportPeriodStartForFilename(
  kind: ReportKind,
  value: string,
): string {
  if (kind === "MONTHLY") return `${value}-01`;
  return value;
}

/** Per-kind draft inputs kept side by side so kind switches preserve them. */
export interface ReportPeriodDrafts {
  readonly date: string;
  readonly weekStart: string;
  readonly month: string;
}

export function draftValueForKind(
  drafts: ReportPeriodDrafts,
  kind: ReportKind,
): string {
  if (kind === "DAILY") return drafts.date;
  if (kind === "WEEKLY") return drafts.weekStart;
  return drafts.month;
}
