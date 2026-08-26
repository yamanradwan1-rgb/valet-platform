import { hasSessionEnded } from "./access-schedule";
import type {
  AuthRefreshMode,
  SessionSnapshot,
} from "./refresh-decision";
import type { SessionEvent } from "./cross-tab-session";

/**
 * Pure coordination rules for session events arriving from sibling tabs and
 * for queued refreshes waking up behind a sibling rotation.
 *
 * BroadcastChannel gives per-sender FIFO delivery but NO total order across
 * senders, and events can be delayed arbitrarily relative to LOCAL state
 * changes (logout, fresh login). The rules below therefore never trust
 * arrival order:
 *
 * - `refreshed` is adopted only when its SERVER-AUTHORED access expiry is
 *   strictly newer than the locally held one. Every rotation of one login
 *   family strictly increases `accessExpiresAt`, and a fresh login always
 *   produces a newer expiry than any pre-login rotation, so this single
 *   comparison rejects both reordered rotations and stale pre-replacement
 *   events without any client-side clock math.
 *
 * - `ended` / `replaced` are dominant: they tear down any live local
 *   session EXCEPT when the event demonstrably predates the local claim
 *   (`occurredAtMs < claimedAtMs`, same-device wall clock). A late logout
 *   broadcast from another tab must never kill a login completed afterwards,
 *   and no event may resurrect state once the local runtime is empty.
 *
 * All inputs are non-secret coordination metadata; none of it ever becomes
 * authorization evidence — every request stays authorized server-side by
 * bearer credential alone.
 */

export interface SiblingEventInput {
  readonly event: SessionEvent;
  /** Whether the local runtime currently holds a live session view. */
  readonly hasLiveSession: boolean;
  /** Local claim time (login/restore apply) of the current session, if any. */
  readonly claimedAtMs: number | null;
  /** Server-authored access expiry of the locally held token, if any. */
  readonly currentAccessExpiresAtMs: number | null;
  /** Current wall-clock instant (injected for deterministic purity). */
  readonly nowMs: number;
}

export type SiblingEventAction =
  | { readonly action: "ignore" }
  | {
      readonly action: "adopt";
      readonly accessToken: string;
      readonly accessExpiresAt: string;
      readonly sessionExpiresAt: string;
    }
  | {
      /** Tear the local UI session down; maps to an AuthStatus directly. */
      readonly action: "end-local";
      readonly status: "unauthenticated" | "expired";
    };

export function reduceSiblingEvent(
  input: SiblingEventInput,
): SiblingEventAction {
  const {
    claimedAtMs,
    currentAccessExpiresAtMs,
    event,
    hasLiveSession,
    nowMs,
  } = input;

  if (!hasLiveSession) return { action: "ignore" };

  if (event.type === "refreshed") {
    if (
      currentAccessExpiresAtMs !== null &&
      Date.parse(event.accessExpiresAt) <= currentAccessExpiresAtMs
    ) {
      // Stale or reordered rotation (or a pre-replacement event): the local
      // credential lineage already holds something at least as new.
      return { action: "ignore" };
    }
    if (hasSessionEnded(nowMs, Date.parse(event.sessionExpiresAt))) {
      return { action: "ignore" };
    }
    return {
      accessToken: event.accessToken,
      accessExpiresAt: event.accessExpiresAt,
      action: "adopt",
      sessionExpiresAt: event.sessionExpiresAt,
    };
  }

  // ended(signed-out | expired) and replaced: dominance with claim ordering.
  if (claimedAtMs !== null && event.occurredAtMs < claimedAtMs) {
    // The event predates the locally claimed session (e.g. another tab's
    // logout delivered late, after this tab completed a fresh login).
    return { action: "ignore" };
  }
  if (event.type === "replaced") {
    // Another tab claimed the shared browser session through a fresh login;
    // the previous principal must end locally and re-authenticate.
    return { action: "end-local", status: "unauthenticated" };
  }
  return {
    action: "end-local",
    status: event.reason === "expired" ? "expired" : "unauthenticated",
  };
}

/**
 * Decides whether a refresh that just acquired the cross-tab auth lock still
 * needs to perform a network rotation. When a sibling rotated while this tab
 * waited AND its broadcast was already adopted (live session, different
 * token), rotating again would needlessly invalidate the sibling's token.
 */
export function shouldSkipQueuedRefresh(input: {
  mode: AuthRefreshMode;
  before: SessionSnapshot | null;
  tokenChangedWhileQueued: boolean;
}): boolean {
  return (
    input.mode === "refresh" &&
    input.before !== null &&
    input.tokenChangedWhileQueued
  );
}
