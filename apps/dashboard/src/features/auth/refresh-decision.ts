import type { StaffAuthAccessResponse } from "@valet/contracts";

import { DashboardApiError } from "../../lib/api/api-error";

/**
 * Pure decision core for the single-flight staff session refresh.
 *
 * The auth provider awaits `POST /v1/staff/auth/refresh` and then must decide
 * what to apply. The await window is racy: the user can sign out, sign in as
 * another principal, or a sibling tab can broadcast newer access state while
 * the request is in flight. Every rule below is expressed against two
 * runtime-session snapshots (`before` captured pre-await, `after` read
 * post-await) so the security-relevant logic stays directly unit-testable
 * and free of React.
 *
 * Snapshot identity (object reference) is sound here because the module-level
 * auth runtime always stores a NEW session view object on every state change
 * and `null` after teardown, so `after !== before` means exactly "some other
 * authentication change won while this refresh was in flight".
 */

/** Local projection of the runtime session used for identity comparison. */
export interface SessionSnapshot {
  readonly email: string;
}

/**
 * - restore: cold silent refresh against the httpOnly cookie; no live
 *   runtime session exists yet.
 * - refresh: proactive timer or 401 recovery for the live session.
 */
export type AuthRefreshMode = "restore" | "refresh";

export type RefreshOutcome =
  | { readonly ok: true; readonly tokens: StaffAuthAccessResponse }
  | { readonly ok: false; readonly error: unknown };

export type RefreshDecision =
  /** Store the tokens for `email` and mark the session authenticated. */
  | { readonly action: "apply"; readonly email: string }
  /** Discard the result without touching any state (a newer change won). */
  | { readonly action: "ignore" }
  /** Server rejected the credential family; the session is over. */
  | { readonly action: "end-expired" }
  /** Cold-restore posture failure; resolve to sign-in (fail closed). */
  | { readonly action: "end-unauthenticated" }
  /**
   * Transient (network/server) failure with an untouched live session:
   * keep credentials/status and schedule a near-term retry.
   */
  | { readonly action: "retry-later" };

/**
 * Only an authoritative backend rejection ends a session. Transport and
 * server failures must never be misclassified as session expiry — the
 * httpOnly refresh cookie remains valid and is retried shortly after.
 */
export function isSessionOverError(error: unknown): boolean {
  return (
    error instanceof DashboardApiError &&
    (error.kind === "session-expired" ||
      error.code === "STAFF_AUTHENTICATION_FAILED")
  );
}

export function decideAuthRefreshResult(input: {
  mode: AuthRefreshMode;
  before: SessionSnapshot | null;
  after: SessionSnapshot | null;
  outcome: RefreshOutcome;
}): RefreshDecision {
  const { mode, before, after, outcome } = input;

  if (mode === "restore") {
    if (after !== null) return { action: "ignore" };
    // Still nothing else claimed the runtime slot: this flight owns it.
    if (outcome.ok) return { action: "apply", email: "" };
    return { action: "end-unauthenticated" };
  }

  if (before === null) return { action: "ignore" };
  if (after !== before) return { action: "ignore" };
  if (outcome.ok) return { action: "apply", email: before.email };
  return isSessionOverError(outcome.error)
    ? { action: "end-expired" }
    : { action: "retry-later" };
}
