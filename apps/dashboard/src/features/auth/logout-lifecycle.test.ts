import { describe, expect, it } from "vitest";

import type { StaffAuthAccessResponse } from "@valet/contracts";

import type { AuthStatus } from "./auth-types";
import type { StaffSessionView } from "./auth-runtime";
import {
  runInAuthMutationLock,
  type SessionEvent,
  type WebLockManagerLike,
} from "./cross-tab-session";
import { runTruthfulLogout } from "./logout-lifecycle";
import { decideAuthRefreshResult } from "./refresh-decision";
import { reduceSiblingEvent } from "./sibling-session";

const VIEW: StaffSessionView = {
  email: "manager@example.com",
  accessExpiresAt: "2025-01-01T00:10:00Z",
  sessionExpiresAt: "2025-01-31T00:00:00Z",
};

const TOKENS: StaffAuthAccessResponse = {
  accessExpiresAt: "2025-01-01T00:20:00Z",
  accessToken: `vsa1.${"A".repeat(43)}`,
  sessionExpiresAt: VIEW.sessionExpiresAt,
  tokenType: "Bearer",
};

function createHarness(serverLogout: () => Promise<void>) {
  const state: {
    session: StaffSessionView | null;
    token: string | null;
  } = { session: VIEW, token: "access-token" };
  const statuses: AuthStatus[] = [];
  const events: SessionEvent[] = [];
  let timerClears = 0;

  return {
    dependencies: {
      clearRefreshTimer: () => {
        timerClears += 1;
      },
      clearSession: () => {
        state.session = null;
        state.token = null;
      },
      markFailed: () => statuses.push("logout-failed"),
      markSignedOut: () => statuses.push("unauthenticated"),
      markStarted: () => statuses.push("signing-out"),
      publishSignedOut: () =>
        events.push({
          occurredAtMs: 1_000,
          reason: "signed-out",
          type: "ended",
        }),
      runLocked: (action: () => Promise<void>) => action(),
      serverLogout,
    },
    events,
    state,
    statuses,
    timerClears: () => timerClears,
  };
}

describe("runTruthfulLogout", () => {
  it("clears the session and publishes signed-out only after server success", async () => {
    const harness = createHarness(async () => undefined);

    await expect(runTruthfulLogout(harness.dependencies)).resolves.toBeUndefined();

    expect(harness.state).toEqual({ session: null, token: null });
    expect(harness.statuses).toEqual(["signing-out", "unauthenticated"]);
    expect(harness.events).toEqual([
      { occurredAtMs: 1_000, reason: "signed-out", type: "ended" },
    ]);
    expect(harness.timerClears()).toBe(1);
  });

  it("fails closed locally and publishes nothing on failure", async () => {
    const failure = new Error("logout response unavailable");
    const harness = createHarness(async () => Promise.reject(failure));

    await expect(runTruthfulLogout(harness.dependencies)).rejects.toBe(failure);

    expect(harness.state).toEqual({ session: null, token: null });
    expect(harness.statuses).toEqual(["signing-out", "logout-failed"]);
    expect(harness.events).toEqual([]);
    expect(harness.timerClears()).toBe(2);
  });

  it("requires an explicit successful retry before claiming revocation", async () => {
    let attempts = 0;
    const harness = createHarness(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("network down");
    });

    await expect(runTruthfulLogout(harness.dependencies)).rejects.toThrow(
      "network down",
    );
    expect(harness.events).toHaveLength(0);
    await expect(runTruthfulLogout(harness.dependencies)).resolves.toBeUndefined();

    expect(harness.state.session).toBeNull();
    expect(harness.events).toHaveLength(1);
    expect(harness.statuses).toEqual([
      "signing-out",
      "logout-failed",
      "signing-out",
      "unauthenticated",
    ]);
  });

  it("leaves a later reload free to restore the still-live server session", async () => {
    const harness = createHarness(async () => {
      throw new Error("response lost");
    });
    await expect(runTruthfulLogout(harness.dependencies)).rejects.toThrow();

    expect(
      decideAuthRefreshResult({
        after: null,
        before: null,
        mode: "restore",
        outcome: { ok: true, tokens: TOKENS },
      }),
    ).toEqual({ action: "apply", email: "" });
    expect(harness.events).toEqual([]);
  });

  it("ends sibling sessions only for a confirmed successful logout", async () => {
    const harness = createHarness(async () => undefined);
    await runTruthfulLogout(harness.dependencies);

    expect(
      reduceSiblingEvent({
        claimedAtMs: 500,
        currentAccessExpiresAtMs: Date.parse(VIEW.accessExpiresAt),
        event: harness.events[0]!,
        hasLiveSession: true,
        nowMs: 1_000,
      }),
    ).toEqual({ action: "end-local", status: "unauthenticated" });
  });
});

class FakeLockManager implements WebLockManagerLike {
  private tail: Promise<unknown> = Promise.resolve();

  request<T>(_name: string, callback: () => Promise<T>): Promise<T> {
    const result = this.tail.then(callback, callback);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

describe("logout and refresh serialization", () => {
  it("cannot apply a queued refresh after successful revocation", async () => {
    const lockManager = new FakeLockManager();
    const harness = createHarness(async () => undefined);
    harness.dependencies.runLocked = (action) =>
      runInAuthMutationLock(action, lockManager);
    const beforeRefresh = harness.state.session;

    const logout = runTruthfulLogout(harness.dependencies);
    const refresh = runInAuthMutationLock(async () =>
      decideAuthRefreshResult({
        after: harness.state.session,
        before: beforeRefresh,
        mode: "refresh",
        outcome: { ok: true, tokens: TOKENS },
      }), lockManager);

    await expect(logout).resolves.toBeUndefined();
    await expect(refresh).resolves.toEqual({ action: "ignore" });
    expect(harness.state).toEqual({ session: null, token: null });
  });
});
