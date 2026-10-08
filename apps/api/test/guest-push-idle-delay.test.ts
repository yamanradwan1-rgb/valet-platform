import { afterEach, describe, expect, it, vi } from "vitest";

import { waitForGuestPushPoll } from "../src/modules/guest-push/guest-push-idle-delay";

afterEach(() => {
  vi.useRealTimers();
});

describe("Guest Push worker idle poll", () => {
  it("removes each abort listener after every successful timeout", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const add = vi.spyOn(abort.signal, "addEventListener");
    const remove = vi.spyOn(abort.signal, "removeEventListener");

    for (let index = 0; index < 20; index += 1) {
      const wait = waitForGuestPushPoll(1_000, abort.signal);
      await vi.advanceTimersByTimeAsync(1_000);
      await wait;
    }

    expect(add).toHaveBeenCalledTimes(20);
    expect(remove).toHaveBeenCalledTimes(20);
    abort.abort();
  });

  it("clears pending timeout when shutdown begins", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const remove = vi.spyOn(abort.signal, "removeEventListener");
    const wait = waitForGuestPushPoll(10_000, abort.signal);
    expect(vi.getTimerCount()).toBe(1);

    abort.abort();
    await wait;

    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledTimes(1);
    await waitForGuestPushPoll(10_000, abort.signal);
    expect(vi.getTimerCount()).toBe(0);
  });
});
