import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearRefreshTimer,
  clearStaffSession,
  claimStaffSession,
  getStaffAccessToken,
  getStaffSession,
  getStaffSessionClaimedAtMs,
  recoverStaffUnauthorized,
  registerRefreshTrigger,
  registerUnauthorizedRecovery,
  runSingleFlightRefresh,
  scheduleProactiveRefresh,
  setStaffSession,
  triggerStaffRefresh,
  type StaffSessionView,
} from "./auth-runtime";

const VIEW: StaffSessionView = {
  email: "manager@example.com",
  accessExpiresAt: "2025-01-01T00:10:00Z",
  sessionExpiresAt: "2025-01-31T00:00:00Z",
};

beforeEach(() => {
  clearStaffSession();
  clearRefreshTimer();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("module runtime state", () => {
  it("starts without any credential material", () => {
    expect(getStaffAccessToken()).toBeNull();
    expect(getStaffSession()).toBeNull();
  });

  it("stores and clears session plus token together", () => {
    setStaffSession(VIEW, "token-1");
    expect(getStaffAccessToken()).toBe("token-1");
    expect(getStaffSession()).toEqual(VIEW);

    clearStaffSession();
    expect(getStaffAccessToken()).toBeNull();
    expect(getStaffSession()).toBeNull();
  });

  it("assigns a fresh session object per change so snapshots can be compared", () => {
    setStaffSession(VIEW, "token-1");
    const first = getStaffSession();
    setStaffSession({ ...VIEW, email: "other@example.com" }, "token-2");
    const second = getStaffSession();
    expect(first).not.toBe(second);
    expect(first).toEqual(VIEW);
    expect(getStaffAccessToken()).toBe("token-2");
  });

  it("records the claim instant and preserves it across rotations", () => {
    expect(getStaffSessionClaimedAtMs()).toBeNull();

    claimStaffSession(VIEW, "token-1", 1_000);
    expect(getStaffSessionClaimedAtMs()).toBe(1_000);

    // A rotation applies tokens without changing the original claim instant.
    setStaffSession({ ...VIEW }, "token-2");
    expect(getStaffSessionClaimedAtMs()).toBe(1_000);

    clearStaffSession();
    expect(getStaffSessionClaimedAtMs()).toBeNull();
  });
});

describe("runSingleFlightRefresh", () => {
  it("shares one in-flight refresh across concurrent callers", async () => {
    let attempts = 0;
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });

    const first = runSingleFlightRefresh(() => {
      attempts += 1;
      return gate;
    });
    const second = runSingleFlightRefresh(() => {
      attempts += 1;
      return gate;
    });

    release("token-shared");
    await expect(first).resolves.toBe("token-shared");
    await expect(second).resolves.toBe("token-shared");
    expect(attempts).toBe(1);
  });

  it("runs a new attempt after the previous flight settled", async () => {
    let attempts = 0;
    const run = (): Promise<string | null> =>
      runSingleFlightRefresh(async () => {
        attempts += 1;
        return `token-${attempts}`;
      });

    await expect(run()).resolves.toBe("token-1");
    await expect(run()).resolves.toBe("token-2");
    expect(attempts).toBe(2);
  });

  it("releases the flight even when the attempt fails", async () => {
    const run = (): Promise<string | null> =>
      runSingleFlightRefresh(async () => {
        throw new Error("network down");
      });
    await expect(run()).rejects.toThrow("network down");

    let retried = false;
    await expect(
      runSingleFlightRefresh(async () => {
        retried = true;
        return null;
      }),
    ).resolves.toBeNull();
    expect(retried).toBe(true);
  });
});

describe("registered recovery and trigger indirection", () => {
  it("defaults to an unsuccessful recovery before registration", async () => {
    await expect(recoverStaffUnauthorized()).resolves.toBeNull();
    await expect(triggerStaffRefresh()).resolves.toBeNull();
  });

  it("delegates to the registered provider functions", async () => {
    registerUnauthorizedRecovery(async () => "recovered-token");
    registerRefreshTrigger(async () => null);
    await expect(recoverStaffUnauthorized()).resolves.toBe("recovered-token");
    await expect(triggerStaffRefresh()).resolves.toBeNull();
  });
});

describe("proactive refresh timer", () => {
  function fakeWindowTimers(): {
    cleared: number[];
    fire: (id: number) => void;
    timeouts: Map<number, () => void>;
  } {
    const timeouts = new Map<number, () => void>();
    const cleared: number[] = [];
    let nextId = 1;
    vi.stubGlobal("window", {
      clearTimeout: (id: number) => {
        cleared.push(id);
        timeouts.delete(id);
      },
      setTimeout: (callback: () => void): number => {
        const id = nextId;
        nextId += 1;
        timeouts.set(id, callback);
        return id;
      },
    });
    return {
      cleared,
      fire: (id: number) => timeouts.get(id)?.(),
      timeouts,
    };
  }

  it("stores exactly one proactive timer and clears any predecessor", () => {
    const timers = fakeWindowTimers();

    scheduleProactiveRefresh(1000, () => {});
    expect(timers.timeouts.size).toBe(1);

    scheduleProactiveRefresh(2000, () => {});
    // The earlier timer was cancelled, not left to double-refresh.
    expect(timers.timeouts.size).toBe(1);
    expect(timers.cleared).toHaveLength(1);

    clearRefreshTimer();
    expect(timers.timeouts.size).toBe(0);
  });

  it("clearing without a scheduled timer is a no-op", () => {
    const timers = fakeWindowTimers();
    clearRefreshTimer();
    expect(timers.cleared).toEqual([]);
  });
});
