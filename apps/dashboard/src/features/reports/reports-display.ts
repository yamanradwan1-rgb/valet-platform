import type {
  AnalyticsDurationMetric,
  AnalyticsRate,
} from "@valet/contracts";

/**
 * Pure display formatting for the Reports surface.
 *
 * FORMULA OWNERSHIP: the backend owns every formula. Duration averages,
 * rate percentages and incidents-per-1000 values render VERBATIM as
 * reported; null renders the localized unavailable label and is never
 * turned into a zero. Monetary amounts are pure `${currency} ${amount}`
 * concatenations of exact backend strings — no Number(), no parseFloat(),
 * no toFixed(), no cross-currency totals, no conversion. The only numeric
 * styling here is scaling cars-per-day bars to the max count of their own
 * series (a trivially accepted presentation derivation).
 */

export function formatReportDuration(
  metric: AnalyticsDurationMetric,
  unavailableLabel: string,
): string {
  if (metric.averageSeconds === null) return unavailableLabel;
  return `${metric.averageSeconds}s`;
}

export function formatRatePercentageVerbatim(
  rate: AnalyticsRate,
  unavailableLabel: string,
): string {
  if (rate.percentage === null) return unavailableLabel;
  return `${rate.percentage}%`;
}

export function formatCurrencyAmount(
  currency: string,
  amount: string,
): string {
  return `${currency} ${amount}`;
}

export function formatIncidentsPer1000Value(
  value: string | null,
  unavailableLabel: string,
): string {
  if (value === null) return unavailableLabel;
  return value;
}

/** Largest count in the cars-handled series (bar scale basis). */
export function maxHandledCount(
  entries: readonly { readonly handledCount: number }[],
): number {
  let max = 0;
  for (const entry of entries) {
    if (entry.handledCount > max) max = entry.handledCount;
  }
  return max;
}

/** Bar width percent relative to the series max (presentation only). */
export function handledBarPercent(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  return Math.round((count / maxCount) * 100);
}

/**
 * Conservative display for the free-form backend incident `type`.
 * LOSSLESS by design: casing never changes ("VIP" stays "VIP"), only
 * underscore separators in ALL-CAPS machine tokens widen to spaces;
 * anything else renders verbatim rather than inventing taxonomy.
 */
export function humanizeIncidentType(type: string): string {
  const trimmed = type.trim();
  if (trimmed.length === 0) return "—";
  if (/[a-z]/u.test(trimmed)) return trimmed;
  if (!trimmed.includes("_")) return trimmed;
  return trimmed.replace(/_/gu, " ");
}
