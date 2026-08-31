import { describe, expect, it, vi } from "vitest";

import { logoutWithEmployeePushCleanup } from "./employee-push-logout";

describe("Employee push logout boundary", () => {
  it("attempts notification cleanup first but never lets its failure block logout", async () => {
    const calls: string[] = [];
    const cleanup = vi.fn(async () => {
      calls.push("cleanup");
      throw new Error("notification cleanup failed");
    });
    const logout = vi.fn(async () => {
      calls.push("logout");
    });

    await expect(
      logoutWithEmployeePushCleanup(cleanup, logout),
    ).resolves.toBeUndefined();
    expect(calls).toEqual(["cleanup", "logout"]);
  });

  it("bounds a stalled cleanup before canonical logout", async () => {
    vi.useFakeTimers();
    const cleanup = vi.fn(() => new Promise<void>(() => undefined));
    const logout = vi.fn().mockResolvedValue(undefined);
    const pending = logoutWithEmployeePushCleanup(cleanup, logout, 50);
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(logout).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
