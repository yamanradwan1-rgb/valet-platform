/**
 * DEC-023 cross-tab session coordination for the Management Dashboard.
 *
 * All dashboard tabs share ONE httpOnly refresh cookie and the backend keeps
 * exactly one current access credential per login session. Every refresh
 * therefore rotates the family: two tabs refreshing concurrently look like
 * replay (server revokes the whole session), and a rotation silently
 * invalidates every OTHER tab's in-memory bearer token. Login and logout are
 * also shared-cookie mutations: a logout response can be reordered before an
 * in-flight refresh response and resurrect a cleared cookie, and a login can
 * be overwritten by a slower earlier refresh.
 *
 * One browser-wide auth-mutation lock covers refresh AND login AND logout,
 * plus a same-origin broadcast of new access state, session replacement and
 * sign-out/expiry so sibling tabs adopt or tear down deterministically.
 * Ordering is handled by pure rules in `sibling-session.ts` (never by
 * arrival order); see that module for the freshness/dominance model.
 *
 * All primitives are feature-detected: without them the code degrades to
 * per-tab behavior with server-side replay detection (the DEC's documented
 * fallback is reauthentication, never weakened replay detection). No token
 * material ever touches storage; broadcast payloads are memory-only
 * coordination facts visible only to same-origin scripts, which could always
 * read the in-memory token anyway — BroadcastChannel does NOT hide tokens
 * from JS, it merely avoids extra rotations and stale principals.
 */

/** Same versioned shape enforced by @valet/contracts for staff access tokens. */
const accessTokenPattern = /^vsa1\.[A-Za-z0-9_-]{43}$/;

export const AUTH_MUTATION_LOCK_NAME = "vaylet.staff.auth.v1";
const SESSION_EVENT_CHANNEL_NAME = "vaylet.staff.session.v1";

/**
 * Coordination events between sibling tabs of the same origin.
 *
 * `occurredAtMs` is the sender's wall-clock instant for terminal events; it
 * exists purely so receivers can reject events that predate their own newer
 * local claim. It is non-secret, never persisted, and never authorization
 * evidence.
 */
export type SessionEvent =
  | {
      readonly type: "refreshed";
      readonly accessToken: string;
      readonly accessExpiresAt: string;
      readonly sessionExpiresAt: string;
    }
  | {
      readonly type: "ended";
      readonly reason: "signed-out" | "expired";
      readonly occurredAtMs: number;
    }
  | {
      /** A sibling tab completed a fresh login claiming the shared cookie. */
      readonly type: "replaced";
      readonly occurredAtMs: number;
    };

export interface WebLockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

interface BroadcastChannelLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  close(): void;
  postMessage(message: unknown): void;
}

function globalLockManager(): WebLockManagerLike | null {
  const candidate = (globalThis as {
    navigator?: { locks?: WebLockManagerLike };
  }).navigator?.locks;
  return candidate && typeof candidate.request === "function"
    ? candidate
    : null;
}

/**
 * Runs one browser-level authentication mutation (refresh | login | logout)
 * under the shared lock so no two of them interleave against the shared
 * httpOnly cookie. Falls back to direct execution where Web Locks are
 * unavailable.
 */
export function runInAuthMutationLock<T>(
  action: () => Promise<T>,
  lockManager: WebLockManagerLike | null = globalLockManager(),
): Promise<T> {
  return lockManager === null
    ? action()
    : lockManager.request(AUTH_MUTATION_LOCK_NAME, action);
}

function isNonEmptyTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isFiniteMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Strict inbound validation: malformed or foreign events are dropped. */
export function parseSessionEvent(data: unknown): SessionEvent | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as Record<string, unknown>;
  if (candidate["type"] === "refreshed") {
    const accessToken = candidate["accessToken"];
    const accessExpiresAt = candidate["accessExpiresAt"];
    const sessionExpiresAt = candidate["sessionExpiresAt"];
    if (
      typeof accessToken === "string" &&
      accessTokenPattern.test(accessToken) &&
      isNonEmptyTimestamp(accessExpiresAt) &&
      isNonEmptyTimestamp(sessionExpiresAt)
    ) {
      return {
        accessToken,
        accessExpiresAt,
        sessionExpiresAt,
        type: "refreshed",
      };
    }
    return null;
  }
  const occurredAtMs = candidate["occurredAtMs"];
  if (!isFiniteMs(occurredAtMs)) return null;
  if (candidate["type"] === "ended") {
    const reason = candidate["reason"];
    if (reason === "expired" || reason === "signed-out") {
      return { occurredAtMs, reason, type: "ended" };
    }
    return null;
  }
  if (candidate["type"] === "replaced") {
    return { occurredAtMs, type: "replaced" };
  }
  return null;
}

type SessionEventListener = (event: SessionEvent) => void;

const listeners = new Set<SessionEventListener>();
let sharedChannel: BroadcastChannelLike | null = null;

function channelConstructor(): (new (name: string) => BroadcastChannelLike) | null {
  const candidate = (globalThis as {
    BroadcastChannel?: new (name: string) => BroadcastChannelLike;
  }).BroadcastChannel;
  return typeof candidate === "function" ? candidate : null;
}

function ensureChannel(): BroadcastChannelLike | null {
  if (sharedChannel !== null) return sharedChannel;
  const ctor = channelConstructor();
  if (ctor === null) return null;
  sharedChannel = new ctor(SESSION_EVENT_CHANNEL_NAME);
  sharedChannel.onmessage = (messageEvent) => {
    const event = parseSessionEvent(messageEvent.data);
    if (event === null) return;
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // A faulty listener must not break sibling notification.
      }
    }
  };
  return sharedChannel;
}

/** Best-effort publish; silently no-op where BroadcastChannel is missing. */
export function publishSessionEvent(event: SessionEvent): void {
  try {
    ensureChannel()?.postMessage(event);
  } catch {
    // Sibling coordination is an optimization, never an authority.
  }
}

/**
 * Subscribes to session events from sibling tabs of this origin.
 * Returns the unsubscribe function.
 */
export function subscribeSessionEvents(
  handler: SessionEventListener,
): () => void {
  listeners.add(handler);
  ensureChannel();
  return () => {
    listeners.delete(handler);
  };
}

/** Test isolation only: drops the shared channel and every listener. */
export function resetCrossTabSessionBus(): void {
  listeners.clear();
  sharedChannel?.close();
  sharedChannel = null;
}
