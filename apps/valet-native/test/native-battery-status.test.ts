import { describe, expect, it, vi } from "vitest";

import {
  NativeBatteryStatusOwner,
  type NativeBatteryOptimizationAdapter,
  type BatteryOptimizationStatus,
} from "../src/notifications/native-battery-status";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fixture() {
  const readStatus = vi.fn<NativeBatteryOptimizationAdapter["readStatus"]>();
  const openSettings = vi.fn(async () => undefined);
  const owner = new NativeBatteryStatusOwner({ readStatus, openSettings });
  return { readStatus, openSettings, owner };
}

describe("#274 framework power-allowlist state owner", () => {
  it.each(["configured", "restricted", "unknown", "unsupported"] as const)(
    "publishes only a verified %s status, no automatic settings action",
    async (state) => {
      const { owner, readStatus, openSettings } = fixture();
      readStatus.mockResolvedValue(state);
      const observed: BatteryOptimizationStatus[] = [];
      owner.subscribe((status) => observed.push(status));
      owner.start(true);
      await vi.waitFor(() => expect(owner.current()).toBe(state));
      expect(readStatus).toHaveBeenCalledOnce();
      expect(observed).toEqual([state]);
      expect(openSettings).not.toHaveBeenCalled();
      owner.dispose();
    },
  );

  it("coalesces duplicate active callbacks and hides a warning during background/resume", async () => {
    const { owner, readStatus } = fixture();
    readStatus.mockResolvedValueOnce("restricted").mockResolvedValueOnce("configured");
    owner.start(true);
    owner.setForeground(true);
    await vi.waitFor(() => expect(owner.current()).toBe("restricted"));
    expect(readStatus).toHaveBeenCalledOnce();
    owner.setForeground(false);
    expect(owner.current()).toBe("checking");
    owner.setForeground(true);
    owner.setForeground(true);
    await vi.waitFor(() => expect(owner.current()).toBe("configured"));
    expect(readStatus).toHaveBeenCalledTimes(2);
    owner.dispose();
  });

  it("fences stale restricted reads across three fast foreground generations", async () => {
    const { owner, readStatus } = fixture();
    const first = deferred<"restricted">();
    const second = deferred<"restricted">();
    readStatus.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
      .mockResolvedValueOnce("configured");
    owner.start(true);
    await vi.waitFor(() => expect(readStatus).toHaveBeenCalledOnce());
    owner.setForeground(false);
    owner.setForeground(true);
    await vi.waitFor(() => expect(readStatus).toHaveBeenCalledTimes(2));
    owner.setForeground(false);
    owner.setForeground(true);
    await vi.waitFor(() => expect(owner.current()).toBe("configured"));
    first.resolve("restricted");
    second.resolve("restricted");
    await Promise.resolve();
    expect(owner.current()).toBe("configured");
    owner.dispose();
  });

  it("handles native rejection as unknown and ignores responses after dispose", async () => {
    const { owner, readStatus } = fixture();
    readStatus.mockRejectedValueOnce(new Error("untrusted native error"));
    owner.start(true);
    await vi.waitFor(() => expect(owner.current()).toBe("unknown"));
    owner.dispose();
    const pending = deferred<"restricted">();
    const next = fixture();
    next.readStatus.mockReturnValue(pending.promise);
    const updates = vi.fn();
    next.owner.subscribe(updates);
    next.owner.start(true);
    await vi.waitFor(() => expect(next.readStatus).toHaveBeenCalledOnce());
    next.owner.dispose();
    pending.resolve("restricted");
    await Promise.resolve();
    expect(next.owner.current()).toBe("checking");
    expect(updates).not.toHaveBeenCalled();
  });

  it("times out a hanging native bridge without retaining a warning", async () => {
    vi.useFakeTimers();
    try {
      const { owner, readStatus } = fixture();
      readStatus.mockReturnValue(new Promise(() => undefined));
      owner.start(true);
      await vi.advanceTimersByTimeAsync(2_500);
      expect(owner.current()).toBe("unknown");
      owner.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
