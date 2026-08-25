import type {
  FinancialOverviewResponse,
  QueueSnapshotResponse,
  SessionStateCountsResponse,
} from "@valet/contracts";

/**
 * Pure presentation derivations for the Management Dashboard Overview.
 *
 * The ONLY business derivation allowed here is the "Vehicles in service"
 * summary: the sum of authoritative backend state counts excluding COMPLETED.
 * Everything else formats backend values for display without ever turning a
 * presented value back into an authoritative business fact.
 */

export type SessionCountEntry = SessionStateCountsResponse["counts"][number];

const COMPLETED_STATE = "COMPLETED";

/**
 * Allowed trivial presentation derivation: vehicles currently in service =
 * sum of the nine canonical state counts excluding COMPLETED. COMPLETED
 * itself remains fully represented wherever raw counts are rendered.
 */
export function deriveVehiclesInService(
  counts: readonly SessionCountEntry[],
): number {
  let total = 0;
  for (const entry of counts) {
    if (entry.state !== COMPLETED_STATE) total += entry.count;
  }
  return total;
}

export interface AgeDisplayUnits {
  readonly minutes: string;
  readonly seconds: string;
}

/**
 * Display-only formatting of the backend's server-clock `oldestAgeSeconds`
 * (string | null). Parsing is permitted exclusively for non-authoritative
 * display styling/formatting; null renders the localized unavailable label.
 * Fractional seconds are floored so a partial second never shows a wrong
 * whole-second count.
 */
export function formatOldestAgeSeconds(
  oldestAgeSeconds: QueueSnapshotResponse["oldestAgeSeconds"],
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

/**
 * Presentation-only accent threshold from the D1 visual reference: waits over
 * five minutes tint the value with the warning color. This carries no SLA or
 * compliance semantics whatsoever.
 */
export const OLDEST_WAIT_WARNING_THRESHOLD_SECONDS = 300;

export function isOldestWaitElevated(
  oldestAgeSeconds: QueueSnapshotResponse["oldestAgeSeconds"],
): boolean {
  if (oldestAgeSeconds === null) return false;
  const totalSeconds = Number(oldestAgeSeconds);
  return (
    Number.isFinite(totalSeconds) &&
    totalSeconds > OLDEST_WAIT_WARNING_THRESHOLD_SECONDS
  );
}

/**
 * True when the location currently has neither an in-service vehicle nor an
 * open/accepted retrieval request. Used only to choose between the regular
 * composition and the localized empty-activity note; zeros themselves remain
 * authoritative and keep rendering.
 */
export function hasCurrentVehicleActivity(
  counts: readonly SessionCountEntry[],
  queueDepth: number,
): boolean {
  return deriveVehiclesInService(counts) > 0 || queueDepth > 0;
}

/**
 * Financial currency groups pass through untouched: per-currency rows keep
 * their exact decimal strings, order and separation. No client-side currency
 * combination, conversion or floating-point arithmetic exists on this page.
 */
export function financialCurrencyGroups(
  financial: FinancialOverviewResponse,
): FinancialOverviewResponse["currencies"] {
  return financial.currencies;
}

export function hasFinancialCurrencies(
  financial: FinancialOverviewResponse,
): boolean {
  return financial.currencies.length > 0;
}
