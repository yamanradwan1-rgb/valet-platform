import { describe, expect, it } from "vitest";

import {
  MIN_REFRESH_DELAY_MS,
  REFRESH_SKEW_MS,
  computeRefreshDelayMs,
  hasSessionEnded,
  isAccessExpired,
} from "./access-schedule";

describe("computeRefreshDelayMs", () => {
  it("schedules the refresh before expiry by the skew margin", () => {
    const now = 1_000_000;
    const expires = now + 120_000;
    expect(computeRefreshDelayMs(now, expires)).toBe(120_000 - REFRESH_SKEW_MS);
  });

  it("never returns less than the minimum delay", () => {
    const now = 1_000_000;
    expect(computeRefreshDelayMs(now, now + 1_000)).toBe(MIN_REFRESH_DELAY_MS);
  });

  it("handles already-expired tokens with the minimum delay", () => {
    const now = 1_000_000;
    expect(computeRefreshDelayMs(now, now - 60_000)).toBe(MIN_REFRESH_DELAY_MS);
  });

  it("honors a custom skew", () => {
    const now = 0;
    expect(computeRefreshDelayMs(now, 100_000, 40_000)).toBe(60_000);
  });
});

describe("isAccessExpired / hasSessionEnded", () => {
  it("treats the boundary instant as expired", () => {
    expect(isAccessExpired(100, 100)).toBe(true);
    expect(hasSessionEnded(200, 200)).toBe(true);
  });

  it("keeps valid instants alive", () => {
    expect(isAccessExpired(99, 100)).toBe(false);
    expect(hasSessionEnded(199, 200)).toBe(false);
  });
});
