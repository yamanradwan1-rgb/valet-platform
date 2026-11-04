import { describe, expect, it } from "vitest";

import {
  arithmeticIssue414GetsPerSecond,
  dispatchIssue414ForegroundGets,
  issue414Percentiles,
  planIssue414ForegroundGets,
} from "./issue414-http-foreground-cadence";

describe("Issue #414 25/100/200 nominal 60s foreground schedule (NO PG)", () => {
  for (const tabs of [25, 100, 200] as const) {
    it(`offers exactly ${tabs} warmup + ${tabs} measured per two 60s cycles`, () => {
      const scheduled = planIssue414ForegroundGets(tabs);
      expect(scheduled).toHaveLength(tabs * 2);
      expect(scheduled.filter((item) => !item.measured)).toHaveLength(tabs);
      expect(scheduled.filter((item) => item.measured)).toHaveLength(tabs);
      expect(
        scheduled.every((item) => item.dueMs >= 0 && item.dueMs < 123_000),
      ).toBe(true);
      expect(scheduled.map((item) => item.dueMs)).toEqual(
        [...scheduled.map((item) => item.dueMs)].sort((a, b) => a - b),
      );
      for (let tab = 0; tab < tabs; tab += 1) {
        const pair = scheduled.filter((item) => item.tab === tab);
        expect(pair).toHaveLength(2);
        expect(pair[1]!.dueMs - pair[0]!.dueMs).toBeGreaterThanOrEqual(57_000);
        expect(pair[1]!.dueMs - pair[0]!.dueMs).toBeLessThanOrEqual(63_000);
      }
      expect(arithmeticIssue414GetsPerSecond(tabs)).toBe(tabs / 60);
      expect(planIssue414ForegroundGets(tabs)).toEqual(scheduled);
    });
  }

  it("never overlaps a prior unsettled GET within the same tab", async () => {
    let settle!: () => void;
    let started!: () => void;
    let inFlight = 0;
    let peak = 0;
    const request = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const run = dispatchIssue414ForegroundGets(
      [
        { tab: 1, cycle: 0, audience: "LM", dueMs: 0, measured: false },
        { tab: 1, cycle: 1, audience: "LM", dueMs: 60_000, measured: true },
      ],
      {
        nowMs: () => 60_000,
        waitUntilMs: async (due) => {
          if (due === 60_000) await requestStarted;
        },
      },
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        started();
        await request;
        inFlight -= 1;
        return 200;
      },
    );
    await requestStarted;
    await new Promise<void>((resolve) => setImmediate(resolve));
    settle();
    const result = await run;
    expect(peak).toBe(1);
    expect(result.completed).toHaveLength(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({ reason: "IN_FLIGHT_SAME_TAB" }),
    ]);
  });

  it("reports exact quantiles and rejects invalid profiles", () => {
    expect(issue414Percentiles([])).toBeNull();
    expect(issue414Percentiles([1, 2, 3, 4, 100])).toEqual({
      p50Ms: 3,
      p95Ms: 100,
      maxMs: 100,
    });
    expect(() => planIssue414ForegroundGets(500 as 25)).toThrow();
    expect(() => planIssue414ForegroundGets(25, 3_001)).toThrow();
  });
});
