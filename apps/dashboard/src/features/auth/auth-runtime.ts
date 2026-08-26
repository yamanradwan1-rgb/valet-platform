/**
 * Module-level staff session runtime.
 *
 * Holds the in-memory access token, the current session view and the
 * proactive-refresh timer outside React. This keeps token material out of
 * web storage and out of render-time ref access while giving the transport
 * client stable module functions for injection/recovery.
 */
export interface StaffSessionView {
  readonly email: string;
  readonly accessExpiresAt: string;
  readonly sessionExpiresAt: string;
}

interface RuntimeState {
  accessToken: string | null;
  session: StaffSessionView | null;
  refreshTimerId: number | null;
  /**
   * Wall-clock instant at which the CURRENT session was claimed by this tab
   * (login or successful cold-restore apply). Rotations preserve it; teardown
   * clears it. Non-secret, memory-only coordination metadata used solely to
   * reject sibling events that predate the local claim.
   */
  claimedAtMs: number | null;
}

const runtime: RuntimeState = {
  accessToken: null,
  claimedAtMs: null,
  session: null,
  refreshTimerId: null,
};

type UnauthorizedRecovery = () => Promise<string | null>;

/**
 * Recovery contract shared with StaffApiClient:
 * - resolves a fresh access token  -> the failed request is retried once;
 * - resolves `null`                -> the client rethrows the ORIGINAL
 *   unauthorized error (authoritative session end);
 * - throws                         -> that error surfaces verbatim instead,
 *   which is how transient refresh failures (network/server) reach feature
 *   surfaces as retryable errors rather than as fake session expiry.
 */
let unauthorizedRecovery: UnauthorizedRecovery = () => Promise.resolve(null);
let refreshTrigger: UnauthorizedRecovery = () => Promise.resolve(null);
let refreshInFlight: Promise<string | null> | null = null;

/** Registers the provider's single-flight refresh as the 401 recovery. */
export function registerUnauthorizedRecovery(
  recovery: UnauthorizedRecovery,
): void {
  unauthorizedRecovery = recovery;
}

/** Stable module function passed to the transport client. */
export function recoverStaffUnauthorized(): Promise<string | null> {
  return unauthorizedRecovery();
}

/** Registers the proactive-refresh trigger used by the timer callback. */
export function registerRefreshTrigger(trigger: UnauthorizedRecovery): void {
  refreshTrigger = trigger;
}

/** Stable module function used by the proactive timer. */
export function triggerStaffRefresh(): Promise<string | null> {
  return refreshTrigger();
}

/**
 * Shares one in-flight refresh across concurrent callers (proactive timer,
 * 401 recovery, multiple data requests failing at once).
 */
export function runSingleFlightRefresh(
  attempt: () => Promise<string | null>,
): Promise<string | null> {
  if (refreshInFlight !== null) return refreshInFlight;
  const promise = attempt().finally(() => {
    refreshInFlight = null;
  });
  refreshInFlight = promise;
  return promise;
}

/** Stable module function passed to the transport client. */
export function getStaffAccessToken(): string | null {
  return runtime.accessToken;
}

export function getStaffSession(): StaffSessionView | null {
  return runtime.session;
}

export function setStaffSession(
  view: StaffSessionView,
  accessToken: string,
): void {
  runtime.session = view;
  runtime.accessToken = accessToken;
}

/**
 * Records that THIS tab just claimed the browser session (login or restore
 * completion). Distinct from rotations: a rotation keeps the original claim
 * instant so late sibling events from before the claim stay rejectable.
 */
export function claimStaffSession(
  view: StaffSessionView,
  accessToken: string,
  claimedAtMs: number,
): void {
  setStaffSession(view, accessToken);
  runtime.claimedAtMs = claimedAtMs;
}

export function getStaffSessionClaimedAtMs(): number | null {
  return runtime.claimedAtMs;
}

export function clearStaffSession(): void {
  runtime.session = null;
  runtime.accessToken = null;
  runtime.claimedAtMs = null;
}

export function clearRefreshTimer(): void {
  if (runtime.refreshTimerId !== null) {
    window.clearTimeout(runtime.refreshTimerId);
    runtime.refreshTimerId = null;
  }
}

export function scheduleProactiveRefresh(
  delayMs: number,
  onFire: () => void,
): void {
  clearRefreshTimer();
  runtime.refreshTimerId = window.setTimeout(() => {
    runtime.refreshTimerId = null;
    void onFire();
  }, delayMs);
}
