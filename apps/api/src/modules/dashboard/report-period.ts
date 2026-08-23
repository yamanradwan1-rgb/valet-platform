import { ApiTransportValidationError } from "../../common/http/api-errors";
import type { AnalyticsPeriod } from "./analytics-period";

const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const localMonthPattern = /^\d{4}-\d{2}$/;
const millisecondsPerDay = 86_400_000;

function parseExactLocalDate(value: string): number | null {
  if (!localDatePattern.test(value)) return null;
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  const utcMillis = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utcMillis);
  return roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
    ? utcMillis
    : null;
}

function requireDate(value: string | undefined): number {
  if (value === undefined) throw new ApiTransportValidationError();
  const millis = parseExactLocalDate(value);
  if (millis === null) throw new ApiTransportValidationError();
  return millis;
}

export function resolveDailyPeriod(date: string | undefined): AnalyticsPeriod {
  const millis = requireDate(date);
  const day = new Date(millis).toISOString().slice(0, 10);
  return { from: day, to: day };
}

export function resolveWeeklyPeriod(
  weekStart: string | undefined,
): AnalyticsPeriod {
  const millis = requireDate(weekStart);
  if (new Date(millis).getUTCDay() !== 1) {
    throw new ApiTransportValidationError();
  }
  const from = new Date(millis).toISOString().slice(0, 10);
  const to = new Date(millis + 6 * millisecondsPerDay)
    .toISOString()
    .slice(0, 10);
  return { from, to };
}

export function resolveMonthlyPeriod(
  month: string | undefined,
): AnalyticsPeriod {
  if (month === undefined || !localMonthPattern.test(month)) {
    throw new ApiTransportValidationError();
  }
  const parts = month.split("-").map(Number);
  const year = parts[0];
  const monthIndex = parts[1];
  if (
    year === undefined ||
    monthIndex === undefined ||
    monthIndex < 1 ||
    monthIndex > 12
  ) {
    throw new ApiTransportValidationError();
  }
  const firstMillis = Date.UTC(year, monthIndex - 1, 1);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const from = new Date(firstMillis).toISOString().slice(0, 10);
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}
