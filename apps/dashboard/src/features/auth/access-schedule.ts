/**
 * Pure timing helpers for the staff access-token lifecycle.
 *
 * The access token is short-lived and held in memory only. Refresh happens:
 * - proactively shortly before `accessExpiresAt`, or
 * - reactively when a data request fails with 401.
 *
 * Persistence across full page reloads relies exclusively on the backend's
 * httpOnly refresh cookie; no token material is stored in web storage.
 */
export const REFRESH_SKEW_MS = 30_000;
export const MIN_REFRESH_DELAY_MS = 5_000;

export function computeRefreshDelayMs(
  nowMs: number,
  accessExpiresAtMs: number,
  skewMs: number = REFRESH_SKEW_MS,
  minDelayMs: number = MIN_REFRESH_DELAY_MS,
): number {
  return Math.max(accessExpiresAtMs - skewMs - nowMs, minDelayMs);
}

export function isAccessExpired(
  nowMs: number,
  accessExpiresAtMs: number,
): boolean {
  return nowMs >= accessExpiresAtMs;
}

export function hasSessionEnded(
  nowMs: number,
  sessionExpiresAtMs: number,
): boolean {
  return nowMs >= sessionExpiresAtMs;
}
