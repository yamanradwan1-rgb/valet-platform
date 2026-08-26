import { afterEach, describe, expect, it } from "vitest";

import type { StaffAuthAccessResponse } from "@valet/contracts";
import type { SessionEvent } from "./cross-tab-session";

import {
  clearStaffSession,
  claimStaffSession,
  getStaffSession,
  setStaffSession,
} from "./auth-runtime";
import {
  decideAuthRefreshResult,
  type RefreshOutcome,
} from "./refresh-decision";
import {
  reduceSiblingEvent,
  shouldSkipQueuedRefresh,
  type SiblingEventAction,
} from "./sibling-session";

const T0 = 1_000_000;
const NOW = Date.parse("2025-01-01T00:05:00Z");

function tokens(accessExpiresAt: string): StaffAuthAccessResponse {
  return {
    accessExpiresAt,
    accessToken: `vsa1.${"A".repeat(43)}`,
    sessionExpiresAt: "2025-01-31T00:00:00Z",
    tokenType: "Bearer",
  };
}

function refreshedEvent(
  accessExpiresAt: string,
): Extract<SessionEvent, { type: "refreshed" }> {
  return {
    accessExpiresAt,
    accessToken: `vsa1.${"B".repeat(43)}`,
    sessionExpiresAt: "2025-01-31T00:00:00Z",
    type: "refreshed",
  };
}

afterEach(() => {
  clearStaffSession();
});

describe("shouldSkipQueuedRefresh", () => {
  const live = { email: "a@example.com" };

  it("skips only live refreshes whose token changed while queued", () => {
    expect(
      shouldSkipQueuedRefresh({
        before: live,
        mode: "refresh",
        tokenChangedWhileQueued: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipQueuedRefresh({
        before: live,
        mode: "refresh",
        tokenChangedWhileQueued: false,
      }),
    ).toBe(false);
    expect(
      shouldSkipQueuedRefresh({
        before: null,
        mode: "refresh",
        tokenChangedWhileQueued: true,
      }),
    ).toBe(false);
    // Restore must always hit the network: nothing was held in memory.
    expect(
      shouldSkipQueuedRefresh({
        before: { email: "" },
        mode: "restore",
        tokenChangedWhileQueued: true,
      }),
    ).toBe(false);
  });
});

/**
 * CRITICAL cross-tab scenario (review items 2/4/5/9), composed end-to-end
 * over the real modules: Tab A authenticated as User A; Tab B signs in as
 * User B; Tab A must end truthfully and no delayed A-lineage event or
 * in-flight refresh may resurrect A or mix identities.
 */
describe("cross-tab account switch composition", () => {
  const USER_A_VIEW = {
    email: "manager-a@example.com",
    accessExpiresAt: "2025-01-01T00:10:00Z",
    sessionExpiresAt: "2025-01-31T00:00:00Z",
  };

  function okOutcome(at: string): RefreshOutcome {
    return { ok: true, tokens: tokens(at) };
  }

  it("replacement tears down User A and defeats every stale resurrection path", () => {
    // Tab A claims its session at login.
    claimStaffSession(USER_A_VIEW, `vsa1.${"A".repeat(43)}`, T0);
    const before = getStaffSession();
    expect(before?.email).toBe("manager-a@example.com");

    // Tab B signs in as User B; the shared cookie now belongs to B's family.
    const resolution: SiblingEventAction = reduceSiblingEvent({
      claimedAtMs: T0,
      currentAccessExpiresAtMs: Date.parse(USER_A_VIEW.accessExpiresAt),
      event: { occurredAtMs: T0 + 500, type: "replaced" },
      hasLiveSession: getStaffSession() !== null,
      nowMs: NOW,
    });
    expect(resolution).toEqual({
      action: "end-local",
      status: "unauthenticated",
    });

    // Tab A executes the teardown structurally (the provider status flips
    // and the whole authenticated subtree unmounts, Location included).
    clearStaffSession();
    expect(getStaffSession()).toBeNull();

    // (a) Delayed refreshed broadcast from A's earlier rotation arrives.
    expect(
      reduceSiblingEvent({
        claimedAtMs: null,
        currentAccessExpiresAtMs: null,
        event: refreshedEvent("2025-01-01T00:20:00Z"),
        hasLiveSession: false,
        nowMs: NOW,
      }),
    ).toEqual({ action: "ignore" });

    // (b) An in-flight refresh R1 completes after the teardown.
    expect(
      decideAuthRefreshResult({
        after: getStaffSession(),
        before,
        mode: "refresh",
        outcome: okOutcome("2025-01-01T00:40:00Z"),
      }),
    ).toEqual({ action: "ignore" });

    // (c) Even a newer rotation cannot resurrect without a local claim.
    expect(
      reduceSiblingEvent({
        claimedAtMs: null,
        currentAccessExpiresAtMs: Date.parse("2025-01-01T00:40:00Z"),
        event: refreshedEvent("2025-01-01T01:40:00Z"),
        hasLiveSession: false,
        nowMs: NOW,
      }),
    ).toEqual({ action: "ignore" });

    // (d) The principal view is gone entirely — no stale User-A email.
    expect(before !== null && getStaffSession() === null).toBe(true);
  });

  it("keeps the adopted lineage's principal view truthful during rotations", () => {
    claimStaffSession(USER_A_VIEW, `vsa1.${"A".repeat(43)}`, T0);

    // A same-principal sibling rotation is adopted with THIS tab's own view:
    // the email shown stays the locally known one and is never taken from
    // the wire (the protocol carries no identity facts).
    const adoption = reduceSiblingEvent({
      claimedAtMs: T0,
      currentAccessExpiresAtMs: Date.parse(USER_A_VIEW.accessExpiresAt),
      event: refreshedEvent("2025-01-01T00:20:00Z"),
      hasLiveSession: true,
      nowMs: NOW,
    });
    expect(adoption.action).toBe("adopt");
    if (adoption.action !== "adopt") return;

    setStaffSession(
      {
        email: getStaffSession()?.email ?? "",
        accessExpiresAt: adoption.accessExpiresAt,
        sessionExpiresAt: adoption.sessionExpiresAt,
      },
      adoption.accessToken,
    );
    expect(getStaffSession()?.email).toBe("manager-a@example.com");

    // Post-reload neutral posture: an unknown principal stays unknown.
    claimStaffSession(
      { ...USER_A_VIEW, email: "" },
      `vsa1.${"C".repeat(43)}`,
      T0 + 10,
    );
    expect(getStaffSession()?.email).toBe("");
  });

  it("orders reordered rotations deterministically by server-authored expiry", () => {
    claimStaffSession(USER_A_VIEW, `vsa1.${"A".repeat(43)}`, T0);
    const currentExpiry = Date.parse(USER_A_VIEW.accessExpiresAt);

    // gen3 rotation arrives first and is adopted...
    const gen3 = reduceSiblingEvent({
      claimedAtMs: T0,
      currentAccessExpiresAtMs: currentExpiry,
      event: refreshedEvent("2025-01-01T00:30:00Z"),
      hasLiveSession: true,
      nowMs: NOW,
    });
    expect(gen3.action).toBe("adopt");

    // ...then the older gen2 broadcast arrives out of order and is dropped.
    const lateGen2 = reduceSiblingEvent({
      claimedAtMs: T0,
      currentAccessExpiresAtMs: Date.parse("2025-01-01T00:30:00Z"),
      event: refreshedEvent("2025-01-01T00:20:00Z"),
      hasLiveSession: true,
      nowMs: NOW,
    });
    expect(lateGen2).toEqual({ action: "ignore" });
  });
});
