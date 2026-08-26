import type {
  AnalyticsDurationMetric,
  AnalyticsRate,
} from "@valet/contracts";

/**
 * Pure display formatting for the Analytics surface.
 *
 * FORMULA OWNERSHIP: the backend owns every formula. Rates, per-1000 values
 * and duration averages are rendered VERBATIM as reported:
 * - `percentage` is a backend string ("65.00") or null; null renders the
 *   localized unavailable label — it is never turned into 0%.
 * - `averageSeconds` is a backend string or null; same honest-null rule.
 * - numerator/denominator facts render alongside for context.
 *
 * The ONLY numeric parsing here is display styling of non-monetary values:
 * flooring queue age into whole minutes/seconds and scaling bars to the max
 * count of the same series (a trivially accepted presentation derivation).
 * Monetary amounts are pure `${currency} ${amount}` concatenations.
 */

export function formatDurationAverage(
  metric: AnalyticsDurationMetric,
  unavailableLabel: string,
): string {
  if (metric.averageSeconds === null) return unavailableLabel;
  return `${metric.averageSeconds}s`;
}

export function formatSampleCount(sampleCount: number): string {
  return String(sampleCount);
}

export function formatRatePercentage(
  rate: AnalyticsRate,
  unavailableLabel: string,
): string {
  if (rate.percentage === null) return unavailableLabel;
  // Verbatim backend percentage string; no rounding, no re-computation.
  return `${rate.percentage}%`;
}

export function formatRateRatio(rate: AnalyticsRate): string {
  return `${rate.numerator} / ${rate.denominator}`;
}

export function formatIncidentsPer1000Value(
  value: string | null,
  unavailableLabel: string,
): string {
  if (value === null) return unavailableLabel;
  return value;
}

export function formatCurrencyAmount(
  currency: string,
  amount: string,
): string {
  return `${currency} ${amount}`;
}

export interface AgeDisplayUnits {
  readonly minutes: string;
  readonly seconds: string;
}

/**
 * Display-only formatting of the backend server-clock `oldestAgeSeconds`
 * (string | null). Null renders the localized unavailable label. Fractional
 * seconds floor so a partial second never shows an inflated whole second.
 */
export function formatQueueAgeSeconds(
  oldestAgeSeconds: string | null,
  unavailableLabel: string,
  units: AgeDisplayUnits,
): string {
  if (oldestAgeSeconds === null) return unavailableLabel;
  const totalSeconds = Math.floor(Number(oldestAgeSeconds));
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return unavailableLabel;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}${units.seconds}`;
  return `${minutes}${units.minutes} ${seconds}${units.seconds}`;
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
 *
 * The transform is LOSSLESS by design: it never rewrites casing, so acronym
 * semantics survive ("VIP" stays "VIP", "QR_LOSS" stays "QR LOSS") and
 * already-human text passes through untouched. Only underscore separators in
 * ALL-CAPS machine tokens are widened to spaces; anything else renders
 * verbatim rather than inventing taxonomy.
 */
export function humanizeIncidentType(type: string): string {
  const trimmed = type.trim();
  if (trimmed.length === 0) return "—";
  // Already-human text (contains lowercase) is never mangled.
  if (/[a-z]/u.test(trimmed)) return trimmed;
  // Single-token codes/acronyms stay verbatim.
  if (!trimmed.includes("_")) return trimmed;
  return trimmed.replace(/_/gu, " ");
}
