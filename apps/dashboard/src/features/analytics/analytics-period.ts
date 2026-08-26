/**
 * Analytics period model (framework-free, directly unit-testable).
 *
 * BACKEND OWNERSHIP: the authoritative period rules live in
 * apps/api/src/modules/dashboard/analytics-period.ts and are re-verified for
 * this task: strict local `YYYY-MM-DD` calendar dates, from <= to, and an
 * inclusive span of at most 31 days ((to - from) < 31 days), resolved in the
 * LOCATION's timezone server-side. The helpers here mirror those rules for UX
 * only (inline validation + a sensible default range); the backend remains
 * the authority and any disagreement surfaces as an honest request failure.
 */

export const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

const MILLISECONDS_PER_DAY = 86_400_000;

export type LocalDateRange = { readonly from: string; readonly to: string };

export type AnalyticsPeriodErrorKind = "format" | "order" | "range";

/** Strict parse mirroring the backend's exact-calendar-date check. */
export function isCalendarLocalDate(value: string): boolean {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
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
    return false;
  }
  const utcMillis = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(utcMillis);
  return (
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day
  );
}

/** Whole-day count of an inclusive local date range (from == to → 1). */
export function inclusiveDayCount(from: string, to: string): number {
  const fromMillis = Date.UTC(
    Number(from.slice(0, 4)),
    Number(from.slice(5, 7)) - 1,
    Number(from.slice(8, 10)),
  );
  const toMillis = Date.UTC(
    Number(to.slice(0, 4)),
    Number(to.slice(5, 7)) - 1,
    Number(to.slice(8, 10)),
  );
  return Math.round((toMillis - fromMillis) / MILLISECONDS_PER_DAY) + 1;
}

/**
 * Mirrors the backend contract for UX gating; null means the pair is valid.
 */
export function validateAnalyticsPeriodInput(
  from: string,
  to: string,
): AnalyticsPeriodErrorKind | null {
  if (!isCalendarLocalDate(from) || !isCalendarLocalDate(to)) {
    return "format";
  }
  if (inclusiveDayCount(from, to) < 1) {
    return "order";
  }
  // Backend rejects (to - from) >= 31 days; i.e. at most 31 inclusive days.
  if (inclusiveDayCount(from, to) > 31) {
    return "range";
  }
  return null;
}

/** Shifts a local date by whole days via UTC arithmetic (DST-safe). */
export function shiftLocalDate(date: string, days: number): string {
  const millis = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)) + days,
  );
  const shifted = new Date(millis);
  const year = String(shifted.getUTCFullYear()).padStart(4, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Today's LOCAL date in the given IANA timezone, derived with the standard
 * library only. This is display/UX derivation from the selected location's
 * configured timezone — never the browser timezone presented as fact.
 */
export function todayInTimeZone(timeZone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const formatted = formatter.format(new Date());
    return isCalendarLocalDate(formatted)
      ? formatted
      : new Date().toISOString().slice(0, 10);
  } catch {
    // Unknown timezone identifier: fall back to UTC rather than guessing.
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Default requested period: the last 7 inclusive local days ending today in
 * the location's timezone. Purely a starting selection; users may shorten it
 * but never extend past the backend's 31-day ceiling.
 */
export function defaultAnalyticsPeriod(timeZone: string): LocalDateRange {
  const today = todayInTimeZone(timeZone);
  return { from: shiftLocalDate(today, -6), to: today };
}
