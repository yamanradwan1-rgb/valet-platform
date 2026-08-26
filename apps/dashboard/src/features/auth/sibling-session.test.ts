import { afterEach, describe, expect, it } from "vitest";

import type { SessionEvent } from "./cross-tab-session";
import {
  clearStaffSession,
  claimStaffSession,
  getStaffSession,
} from "./auth-runtime";
import { reduceSiblingEvent } from "./sibling-session";

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

const T0 = 1_000_000;
/** Fixed receiver clock so expiry fixtures stay deterministic. */
const NOW = Date.parse("2025-01-01T00:05:00Z");

function liveInput(overrides?: {
  claimedAtMs?: number | null;
  currentAccessExpiresAtMs?: number | null;
}): {
  claimedAtMs: number;
  currentAccessExpiresAtMs: number;
  event: SessionEvent;
  hasLiveSession: true;
  nowMs: number;
} {
  return {
    claimedAtMs: overrides?.claimedAtMs ?? T0,
    currentAccessExpiresAtMs:
      overrides?.currentAccessExpiresAtMs ?? Date.parse("2025-01-01T00:10:00Z"),
    event: refreshedEvent("2025-01-01T00:20:00Z"),
    hasLiveSession: true,
    nowMs: NOW,
  };
}

afterEach(() => {
  clearStaffSession();
});

describe("reduceSiblingEvent — refreshed adoption freshness", () => {
  it("adopts a strictly newer sibling rotation", () => {
    const resolution = reduceSiblingEvent(liveInput());
    expect(resolution.action).toBe("adopt");
    if (resolution.action === "adopt") {
      expect(resolution.accessExpiresAt).toBe("2025-01-01T00:20:00Z");
      expect(resolution.sessionExpiresAt).toBe("2025-01-31T00:00:00Z");
    }
  });

  it("rejects a reordered/stale rotation that is not strictly newer", () => {
    const stale = reduceSiblingEvent(
      liveInput({
        currentAccessExpiresAtMs: Date.parse("2025-01-01T00:30:00Z"),
      }),
    );
    expect(stale).toEqual({ action: "ignore" });

    // Equal expiry is treated as already-held (idempotent replay).
    const equal = reduceSiblingEvent(
      liveInput({
        currentAccessExpiresAtMs: Date.parse("2025-01-01T00:20:00Z"),
      }),
    );
    expect(equal).toEqual({ action: "ignore" });
  });

  it("ignores refreshed events once the local runtime is empty", () => {
    const resolution = reduceSiblingEvent({
      ...liveInput(),
      claimedAtMs: null,
      currentAccessExpiresAtMs: null,
      hasLiveSession: false,
    });
    expect(resolution).toEqual({ action: "ignore" });
  });

  it("ignores refresh of an already absolutely expired session", () => {
    const resolution = reduceSiblingEvent({
      ...liveInput(),
      event: {
        ...refreshedEvent("2025-01-01T00:30:00Z"),
        sessionExpiresAt: "2024-12-01T00:00:00Z",
      },
    });
    expect(resolution).toEqual({ action: "ignore" });
  });

  it("keeps a newer rotation whose session window is still open", () => {
    const resolution = reduceSiblingEvent({
      ...liveInput(),
      event: refreshedEvent("2025-01-01T00:30:00Z"),
    });
    expect(resolution.action).toBe("adopt");
  });
});

describe("reduceSiblingEvent — ended/replaced dominance", () => {
  it("ends the local session on a concurrent sign-out", () => {
    const resolution = reduceSiblingEvent({
      ...liveInput(),
      event: { occurredAtMs: T0 + 5, reason: "signed-out", type: "ended" },
    });
    expect(resolution).toEqual({
      action: "end-local",
      status: "unauthenticated",
    });
  });

  it("maps authoritative expiry to the expired posture", () => {
    const resolution = reduceSiblingEvent({
      ...liveInput(),
      event: { occurredAtMs: T0 + 5, reason: "expired", type: "ended" },
    });
    expect(resolution).toEqual({ action: "end-local", status: "expired" });
  });

  it("ends the previous principal when a sibling login replaces the browser session", () => {
    const resolution = reduceSiblingEvent({
      ...liveInput(),
      event: { occurredAtMs: T0 + 50, type: "replaced" },
    });
    expect(resolution).toEqual({
      action: "end-local",
      status: "unauthenticated",
    });
  });

  it("ignores terminal events that predate the locally claimed session", () => {
    // A fresh local login completed AFTER another tab's late logout
    // broadcast was published; the stale event must not kill it.
    for (const event of [
      { occurredAtMs: T0, reason: "signed-out", type: "ended" } as const,
      { occurredAtMs: T0, type: "replaced" } as const,
    ]) {
      const late = reduceSiblingEvent({
        ...liveInput({ claimedAtMs: T0 + 100 }),
        event,
      });
      expect(late).toEqual({ action: "ignore" });
    }

    // An event at/after the claim instant still dominates.
    const concurrent = reduceSiblingEvent({
      ...liveInput({ claimedAtMs: T0 + 100 }),
      event: { occurredAtMs: T0 + 100, reason: "signed-out", type: "ended" },
    });
    expect(concurrent).toEqual({
      action: "end-local",
      status: "unauthenticated",
    });
  });

  it("never ends anything when no live session exists", () => {
    for (const event of [
      { occurredAtMs: T0 + 99, reason: "signed-out", type: "ended" } as const,
      { occurredAtMs: T0 + 99, reason: "expired", type: "ended" } as const,
      { occurredAtMs: T0 + 99, type: "replaced" } as const,
    ]) {
      const resolution = reduceSiblingEvent({
        ...liveInput(),
        event,
        hasLiveSession: false,
      });
      expect(resolution).toEqual({ action: "ignore" });
    }
  });
});

describe("claim ordering metadata", () => {
  it("uses the runtime claim instant so post-claim events dominate", () => {
    claimStaffSession(
      {
        email: "",
        accessExpiresAt: "2025-01-01T00:10:00Z",
        sessionExpiresAt: "2025-01-31T00:00:00Z",
      },
      `vsa1.${"A".repeat(43)}`,
      T0,
    );
    expect(getStaffSession()).not.toBeNull();
    const dominant = reduceSiblingEvent({
      ...liveInput({ claimedAtMs: T0 }),
      event: { occurredAtMs: T0 + 1, type: "replaced" },
    });
    expect(dominant.action).toBe("end-local");
  });
});
