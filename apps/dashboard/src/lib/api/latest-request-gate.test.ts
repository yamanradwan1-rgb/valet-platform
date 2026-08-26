import { describe, expect, it } from "vitest";

import { DashboardApiError } from "./api-error";
import {
  createLatestRequestGate,
  idleLatestRequestSnapshot,
  type LatestRequestSnapshot,
} from "./latest-request-gate";

interface Deferred {
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
  signal: AbortSignal;
}

/** Deterministic deferred fetcher recording every request identity/signal. */
function deferredFetcher(options: {
  failUnlisted?: boolean;
}): {
  requests: { identity: readonly string[]; signal: AbortSignal }[];
  defer: (identity: readonly string[]) => Deferred;
  fetcher: (
    identity: readonly string[],
    signal: AbortSignal,
  ) => Promise<string>;
} {
  const requests: { identity: readonly string[]; signal: AbortSignal }[] = [];
  const pending = new Map<string, Deferred[]>();
  const fetcher = async (
    identity: readonly string[],
    signal: AbortSignal,
  ): Promise<string> => {
    requests.push({ identity, signal });
    if (options.failUnlisted === true) throw new Error("unlisted");
    return new Promise<string>((resolve, reject) => {
      const queue = pending.get(identity.join("|")) ?? [];
      queue.push({ resolve, reject, signal });
      pending.set(identity.join("|"), queue);
    });
  };
  return {
    requests,
    defer: (identity: readonly string[]): Deferred => {
      const queue = pending.get(identity.join("|"));
      const deferred = queue?.shift();
      if (deferred === undefined) throw new Error("no deferred request");
      return deferred;
    },
    fetcher,
  };
}

function harness<T>(fetcher: (identity: readonly string[], signal: AbortSignal) => Promise<T>, unexpectedErrorCode?: string): {
  snapshots: LatestRequestSnapshot<T>[];
  gate: ReturnType<typeof createLatestRequestGate<T>>;
} {
  const snapshots: LatestRequestSnapshot<T>[] = [];
  const gate = createLatestRequestGate<T>({
    fetcher,
    onChange: (snapshot) => snapshots.push(snapshot),
    unexpectedErrorCode,
  });
  return { gate, snapshots };
}

/** A macrotask boundary flushes every pending microtask deterministically. */
function flush(): Promise<void> {
  return new Promise<void>((resolveTimer) => setTimeout(resolveTimer, 0));
}

describe("latest-request-gate lifecycle", () => {
  it("commits loading immediately (clearing prior data), then ready", async () => {
    const deferred = deferredFetcher({});
    const { gate, snapshots } = harness(deferred.fetcher);
    gate.load(["loc-A"]);
    expect(snapshots[0]).toEqual({ phase: "loading", data: null, error: null });
    deferred.defer(["loc-A"]).resolve("payload-A");
    await flush();
    expect(snapshots.at(-1)).toEqual({
      phase: "ready",
      data: "payload-A",
      error: null,
    });
  });

  it("rejects with a normalized DashboardApiError and retries the same identity", async () => {
    const deferred = deferredFetcher({});
    const { gate, snapshots } = harness(
      deferred.fetcher,
      "FEATURE_UNEXPECTED_ERROR",
    );
    gate.load(["loc-A"]);
    deferred.defer(["loc-A"]).reject(new Error("boom"));
    await flush();
    const failed = snapshots.at(-1);
    expect(failed?.phase).toBe("error");
    expect(failed?.error).toBeInstanceOf(DashboardApiError);
    expect(failed?.error?.code).toBe("FEATURE_UNEXPECTED_ERROR");
    gate.retry();
    expect(deferred.requests.at(-1)?.identity).toEqual(["loc-A"]);
    deferred.defer(["loc-A"]).resolve("payload-A2");
    await flush();
    expect(snapshots.at(-1)).toEqual({
      phase: "ready",
      data: "payload-A2",
      error: null,
    });
  });

  it("retry without a prior load is a no-op", () => {
    const deferred = deferredFetcher({ failUnlisted: true });
    const { gate, snapshots } = harness(deferred.fetcher);
    gate.retry();
    expect(snapshots).toHaveLength(0);
    expect(deferred.requests).toHaveLength(0);
  });

  it("passes DashboardApiError instances through unchanged", async () => {
    const failure = new DashboardApiError({
      kind: "authorization-masked",
      status: 404,
      code: "LOCATION_ACCESS_DENIED",
      message: "masked",
    });
    const { gate, snapshots } = harness(async () => {
      throw failure;
    });
    gate.load(["loc-A"]);
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("error");
    expect(snapshots.at(-1)?.error).toBe(failure);
  });
});

describe("latest-request-gate location/period race safety", () => {
  it("never applies a late Location A response after Location B was loaded", async () => {
    const deferred = deferredFetcher({});
    const { gate, snapshots } = harness(deferred.fetcher);

    gate.load(["loc-A"]);
    gate.load(["loc-B"]);

    // The A request was aborted when B superseded it.
    expect(deferred.requests[0]?.signal.aborted).toBe(true);
    expect(deferred.requests[1]?.signal.aborted).toBe(false);

    // Late A resolution is dropped.
    deferred.defer(["loc-A"]).resolve("STALE-A");
    await flush();
    expect(snapshots.every((snapshot) => snapshot.data !== "STALE-A")).toBe(
      true,
    );

    deferred.defer(["loc-B"]).resolve("fresh-B");
    await flush();
    expect(snapshots.at(-1)).toEqual({
      phase: "ready",
      data: "fresh-B",
      error: null,
    });
    // One loading commit per load; A never re-applied.
    expect(snapshots.filter((snapshot) => snapshot.phase === "loading")).toHaveLength(2);
  });

  it("drops a late rejection from a superseded identity", async () => {
    const deferred = deferredFetcher({});
    const { gate, snapshots } = harness(deferred.fetcher);

    gate.load(["loc-A"]);
    gate.load(["loc-B"]);
    deferred.defer(["loc-A"]).reject(new Error("late network failure"));
    await flush();
    deferred.defer(["loc-B"]).resolve("fresh-B");
    await flush();

    expect(snapshots.every((snapshot) => snapshot.phase !== "error")).toBe(true);
    expect(snapshots.at(-1)?.phase).toBe("ready");
  });

  it("clears previously ready data the moment a new identity loads", async () => {
    const deferred = deferredFetcher({});
    const { gate, snapshots } = harness(deferred.fetcher);

    gate.load(["loc-A"]);
    deferred.defer(["loc-A"]).resolve("payload-A");
    await flush();
    expect(snapshots.at(-1)?.phase).toBe("ready");

    gate.load(["loc-B"]);
    // Between B's load and B's response there is NO ready snapshot carrying A.
    const afterSwitch = snapshots.slice(-1);
    expect(afterSwitch[0]?.phase).toBe("loading");
    expect(afterSwitch[0]?.data).toBeNull();
  });

  it("treats each composite period identity as its own request", async () => {
    const deferred = deferredFetcher({});
    const { gate, snapshots } = harness(deferred.fetcher);

    const periodA = ["loc-A", "2026-08-01", "2026-08-07"] as const;
    const periodB = ["loc-A", "2026-08-08", "2026-08-14"] as const;
    gate.load(periodA);
    gate.load(periodB);

    deferred.defer(periodA).resolve("stale-period");
    await flush();
    deferred.defer(periodB).resolve("current-period");
    await flush();

    expect(snapshots.every((snapshot) => snapshot.data !== "stale-period")).toBe(
      true,
    );
    expect(snapshots.at(-1)?.data).toBe("current-period");
  });

  it("ignores everything after dispose and aborts in flight", async () => {
    const deferred = deferredFetcher({});
    const { gate, snapshots } = harness(deferred.fetcher);

    gate.load(["loc-A"]);
    gate.dispose();
    expect(deferred.requests[0]?.signal.aborted).toBe(true);
    deferred.defer(["loc-A"]).resolve("too-late");
    await flush();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.phase).toBe("loading");
  });
});

describe("idleLatestRequestSnapshot", () => {
  it("starts as idle with no data and no error", () => {
    expect(idleLatestRequestSnapshot<number>()).toEqual({
      phase: "idle",
      data: null,
      error: null,
    });
  });
});
