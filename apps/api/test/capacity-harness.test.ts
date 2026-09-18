import { describe, expect, it } from "vitest";
import type { Pool } from "pg";

import { capacityFixtureId } from "../tools/capacity/capacity-fixture";
import { runConcurrent } from "../tools/capacity/capacity-http";
import {
  CapacitySafetyMonitor,
  requireCapacityApiPid,
  SAFETY_LIMITS,
} from "../tools/capacity/capacity-safety";
import { percentile, summarize } from "../tools/capacity/capacity-statistics";
import {
  validateCapacityDetail,
  validateCapacityQueue,
} from "../tools/capacity/capacity-validation";
import type { RequestSample } from "../tools/capacity/capacity-types";

function sample(status = 200, durationMs = 10): RequestSample {
  return { durationMs, operation: "test", status };
}

describe("MOB-025A capacity harness", () => {
  it("rejects a missing API PID before monitoring can start", async () => {
    await expect(requireCapacityApiPid(undefined)).rejects.toThrow(
      "CAPACITY_API_PID is required.",
    );
  });

  it("rejects invalid and unreadable API PIDs", async () => {
    await expect(requireCapacityApiPid("not-a-pid")).rejects.toThrow(
      "CAPACITY_API_PID must be an integer greater than 1.",
    );
    await expect(requireCapacityApiPid("1")).rejects.toThrow(
      "CAPACITY_API_PID must be an integer greater than 1.",
    );
    await expect(requireCapacityApiPid("2147483647")).rejects.toThrow(
      "CAPACITY_API_PID does not identify a readable process.",
    );
  });

  it("accepts a currently readable API PID", async () => {
    await expect(requireCapacityApiPid(String(process.pid))).resolves.toBe(
      process.pid,
    );
  });

  it("creates deterministic RFC 4122 variant fixture identifiers", () => {
    const id = capacityFixtureId(6, 12);
    expect(id).toBe("025a0000-0000-4000-8000-06000000000c");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(capacityFixtureId(7, 12)).not.toBe(id);
  });

  it("rejects cross-scope queue items and missing local fixtures", () => {
    const scope = {
      allowedSessionIds: ["local-a", "local-b"],
      sentinelSessionId: "local-sentinel",
    };
    expect(
      validateCapacityQueue(
        { tasks: [{ sessionId: "local-a" }, { sessionId: "local-b" }] },
        scope,
      ),
    ).toBe(true);
    expect(() =>
      validateCapacityQueue(
        { tasks: [{ sessionId: "local-a" }, { sessionId: "foreign" }] },
        scope,
      ),
    ).toThrow("Hard-zero failure: cross-scope queue item detected.");
    expect(() =>
      validateCapacityQueue({ tasks: [{ sessionId: "local-a" }] }, scope),
    ).toThrow("Task queue omitted the representative fixture.");
  });

  it("rejects a cross-scope session detail", () => {
    expect(() =>
      validateCapacityDetail(
        { locationId: "foreign", sessionId: "session-a" },
        "local",
        "session-a",
      ),
    ).toThrow("Hard-zero failure: cross-scope session detail detected.");
    expect(() =>
      validateCapacityDetail(
        { locationId: "local", sessionId: "session-a" },
        "local",
        "session-a",
      ),
    ).not.toThrow();
  });

  it("calculates nearest-rank percentiles and request summaries", () => {
    const values = Array.from({ length: 100 }, (_, index) => index + 1);
    expect(percentile(values, 0.5)).toBe(50);
    expect(percentile(values, 0.95)).toBe(95);
    expect(percentile(values, 0.99)).toBe(99);
    expect(summarize([sample(200, 10), sample(500, 30)], 100)).toEqual({
      count: 2,
      errorCount: 1,
      errorRate: 0.5,
      p50Ms: 10,
      p95Ms: 30,
      p99Ms: 30,
      requestsPerSecond: 20,
    });
  });

  it("executes exactly the requested count and concurrency", async () => {
    let recorded = 0;
    const monitor = {
      assertRequestLimits: () => undefined,
      record: () => {
        recorded += 1;
      },
      snapshot: async () => ({
        apiCpuPercent: null,
        apiRssBytes: null,
        databaseActiveConnections: 1,
        databaseLockWaiters: 0,
        observedAt: new Date().toISOString(),
      }),
    } as unknown as CapacitySafetyMonitor;
    const result = await runConcurrent("bounded", 21, 5, monitor, async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      return sample();
    });
    expect(recorded).toBe(21);
    expect(result.result.summary.count).toBe(21);
    expect(result.result.maximumInFlight).toBe(5);
    expect(result.result.retries).toBe(0);
  });

  it("stops scheduling new work when an abort condition fires", async () => {
    let calls = 0;
    const monitor = {
      assertRequestLimits: () => {
        if (calls === 3) throw new Error("SAFETY_ABORT: test guard");
      },
      record: () => undefined,
    } as unknown as CapacitySafetyMonitor;
    await expect(
      runConcurrent("abort", 100, 1, monitor, async () => {
        calls += 1;
        return sample();
      }),
    ).rejects.toThrow("SAFETY_ABORT: test guard");
    expect(calls).toBe(3);
  });

  it("aborts on consecutive errors and aggregate error rate", () => {
    const pool = {} as Pool;
    const consecutive = new CapacitySafetyMonitor(pool, process.pid);
    const consecutiveSamples = Array.from({ length: 10 }, () => sample(500));
    for (const value of consecutiveSamples) consecutive.record(value);
    expect(() => consecutive.assertRequestLimits(consecutiveSamples)).toThrow(
      "SAFETY_ABORT: consecutive error limit reached",
    );

    const aggregate = new CapacitySafetyMonitor(pool, process.pid);
    const aggregateSamples = Array.from(
      { length: SAFETY_LIMITS.errorRateMinimumSamples },
      (_, index) => sample(index % 10 === 0 ? 500 : 200),
    );
    for (const value of aggregateSamples) aggregate.record(value);
    expect(() => aggregate.assertRequestLimits(aggregateSamples)).toThrow(
      "SAFETY_ABORT: error-rate limit exceeded",
    );
  });
});
