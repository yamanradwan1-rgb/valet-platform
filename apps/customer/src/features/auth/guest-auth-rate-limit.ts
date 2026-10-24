import { GuestApiError } from "../../lib/api/api-error";

// The UI never waits longer than this for one Guest bootstrap operation.
// Server-declared longer windows remain authoritative and block early retry.
export const MAX_GUEST_AUTH_RETRY_DELAY_MS = 30_000;
export const MAX_GUEST_AUTH_SCHEDULED_RETRY_MS = 15 * 60_000;

export function guestAuthRetryNotBefore(
  error: unknown,
  now = Date.now(),
): number | null {
  if (!(error instanceof GuestApiError) || error.status !== 429) return null;
  const seconds = error.retryAfter;
  const requestedMs =
    seconds !== undefined && Number.isSafeInteger(seconds) && seconds > 0
      ? seconds * 1000
      : 1000;
  // An unrepresentable server deadline must never be truncated into
  // an earlier unauthorized retry.
  return Number.isSafeInteger(requestedMs) &&
    Number.isSafeInteger(now + requestedMs)
    ? now + requestedMs
    : Number.POSITIVE_INFINITY;
}

export async function waitForGuestAuthRetry(
  retryNotBefore: number,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!isCurrent()) return false;
  const remainingMs = retryNotBefore - Date.now();
  if (
    !Number.isFinite(remainingMs) ||
    remainingMs > MAX_GUEST_AUTH_RETRY_DELAY_MS
  ) {
    return false;
  }
  if (remainingMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, remainingMs));
  }
  return isCurrent();
}

// An explicit Retry may wait in the background for a longer server window.
// Keep the existing unavailable screen until the request can actually run.
export async function waitForScheduledGuestAuthRetry(
  retryNotBefore: number,
  isCurrent: () => boolean,
): Promise<boolean> {
  if (!isCurrent()) return false;
  const initialWait = retryNotBefore - Date.now();
  if (
    !Number.isFinite(initialWait) ||
    initialWait > MAX_GUEST_AUTH_SCHEDULED_RETRY_MS
  )
    return false;
  while (isCurrent()) {
    const remaining = retryNotBefore - Date.now();
    if (remaining <= 0) return true;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(MAX_GUEST_AUTH_RETRY_DELAY_MS, remaining)),
    );
  }
  return false;
}

// One deferred replay for a definite 429 only. A second 429 is surfaced
// with its own Retry-After; no automatic loop or visit-token fallback.
export async function recoverGuestAuth429Once<T>(
  first: () => Promise<T>,
  retrySameStage: () => Promise<T>,
  isCurrent: () => boolean,
): Promise<T> {
  try {
    return await first();
  } catch (error) {
    const retryNotBefore = guestAuthRetryNotBefore(error);
    if (
      retryNotBefore === null ||
      !(await waitForGuestAuthRetry(retryNotBefore, isCurrent))
    ) {
      throw error;
    }
    return retrySameStage();
  }
}
