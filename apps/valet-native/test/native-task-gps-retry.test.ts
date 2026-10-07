import { describe, expect, it } from "vitest";

import { NativeTaskGpsRetryBudget } from "../src/tracking/native-task-gps-retry";

describe("#270 Native GPS retry budget", () => {
  it("uses the approved five bounded retry delays and then stops", () => {
    const retry = new NativeTaskGpsRetryBudget(() => 0.5);
    expect([
      retry.nextDelay(),
      retry.nextDelay(),
      retry.nextDelay(),
      retry.nextDelay(),
      retry.nextDelay(),
      retry.nextDelay(),
    ]).toEqual([2_000, 4_000, 8_000, 16_000, 30_000, null]);
  });

  it("keeps jitter bounded to ±10% and resets for a fresh batch", () => {
    expect(new NativeTaskGpsRetryBudget(() => 0).nextDelay()).toBe(1_800);
    expect(new NativeTaskGpsRetryBudget(() => 1).nextDelay()).toBe(2_200);
    const retry = new NativeTaskGpsRetryBudget(() => 0.5);
    expect(retry.nextDelay()).toBe(2_000);
    expect(retry.pendingDelay()).toBe(2_000);
    retry.reset();
    expect(retry.pendingDelay()).toBeNull();
    expect(retry.nextDelay()).toBe(2_000);
  });
});
