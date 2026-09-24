import type { AnalyticsPeriodQuery } from "@valet/contracts";

const canonicalDate = /^\d{4}-\d{2}-\d{2}$/;
const monthOffsets = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334] as const;

export type AnalyticsPeriodValidation =
  | { readonly kind: "required" }
  | { readonly kind: "invalid-date" }
  | { readonly kind: "reversed" }
  | { readonly kind: "too-long" }
  | { readonly kind: "valid"; readonly period: AnalyticsPeriodQuery };

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function exactDay(value: string): number | null {
  if (!canonicalDate.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  if (year < 100) return null;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const completedYear = year - 1;
  const daysBeforeYear = completedYear * 365
    + Math.floor(completedYear / 4)
    - Math.floor(completedYear / 100)
    + Math.floor(completedYear / 400);
  const priorMonthDays = monthOffsets[month - 1]!;
  const leapAdjustment = month > 2 && isLeapYear(year) ? 1 : 0;
  return daysBeforeYear + priorMonthDays + leapAdjustment + day;
}

export function validateAnalyticsPeriod(
  from: string | null,
  to: string | null,
): AnalyticsPeriodValidation {
  if (from === null && to === null) return { kind: "required" };
  if (!from || !to) return { kind: "invalid-date" };
  const fromDay = exactDay(from);
  const toDay = exactDay(to);
  if (fromDay === null || toDay === null) return { kind: "invalid-date" };
  if (fromDay > toDay) return { kind: "reversed" };
  if (toDay - fromDay >= 31) return { kind: "too-long" };
  return { kind: "valid", period: { from, to } };
}

export function explicitAnalyticsPeriod(
  from: string,
  to: string,
): AnalyticsPeriodQuery | null {
  const validation = validateAnalyticsPeriod(from, to);
  return validation.kind === "valid" ? validation.period : null;
}
