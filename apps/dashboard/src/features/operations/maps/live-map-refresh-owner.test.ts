import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardApiError } from "../../../lib/api/dashboard-api-error";
import {
  LiveMapRefreshOwner,
  liveMapPollDelayMs,
  type LiveMapRefreshState,
} from "./live-map-refresh-owner";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, reject, resolve };
}

function setup<T>(loads: Array<Promise<T>>) {
  const states: Array<LiveMapRefreshState<T>> = [];
  const signals: AbortSignal[] = [];
  const load = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    const next = loads.shift();
    if (!next) throw new Error("Unexpected load.");
    return next;
  });
  const owner = new LiveMapRefreshOwner<T>({
    load,
    onState: (state) => states.push(state),
  });
  return { load, owner, signals, states };
}

afterEach(() => vi.useRealTimers());

describe("#270 Live Operations refresh owner", () => {
  it("starts immediately only while LIVE is active and visible", async () => {
    const first = deferred<string>();
    const s = setup([first.promise]);
    s.owner.setVisible(false);
    s.owner.setActive(true);
    expect(s.load).not.toHaveBeenCalled();
    s.owner.setVisible(true);
    expect(s.load).toHaveBeenCalledOnce();
    first.resolve("first");
    await first.promise;
    await Promise.resolve();
    expect(s.states.at(-1)).toEqual({ data: "first", error: null, loading: false });
    s.owner.dispose();
  });

  it("waits 10 seconds after settlement before the next read", async () => {
    vi.useFakeTimers();
    const first = deferred<string>();
    const second = deferred<string>();
    const s = setup([first.promise, second.promise]);
    s.owner.setActive(true);
    first.resolve("one");
    await first.promise;
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(liveMapPollDelayMs - 1);
    expect(s.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.load).toHaveBeenCalledTimes(2);
    second.resolve("two");
    await second.promise;
    s.owner.dispose();
  });

  it("coalesces manual refresh while a protected read is pending", async () => {
    const first = deferred<string>();
    const s = setup([first.promise]);
    s.owner.setActive(true);
    const refresh = s.owner.refresh();
    expect(s.load).toHaveBeenCalledOnce();
    first.resolve("one");
    await refresh;
    expect(s.load).toHaveBeenCalledOnce();
    s.owner.dispose();
  });

  it("aborts and retires a pending read while hidden, then reads once on visibility restore", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const s = setup([first.promise, second.promise]);
    s.owner.setActive(true);
    s.owner.setVisible(false);
    expect(s.signals[0]?.aborted).toBe(true);
    first.resolve("stale");
    await first.promise;
    await Promise.resolve();
    expect(s.states.some((state) => state.data === "stale")).toBe(false);
    s.owner.setVisible(true);
    expect(s.load).toHaveBeenCalledTimes(2);
    second.resolve("fresh");
    await second.promise;
    await Promise.resolve();
    expect(s.states.at(-1)?.data).toBe("fresh");
    s.owner.dispose();
  });

  it("stops polling on definitive authority failure", async () => {
    vi.useFakeTimers();
    const denied = Promise.reject(
      new DashboardApiError({
        code: "LOCATION_ACCESS_DENIED",
        kind: "authorization",
        message: "Denied",
        status: 403,
      }),
    );
    const s = setup([denied]);
    s.owner.setActive(true);
    await denied.catch(() => undefined);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(s.load).toHaveBeenCalledOnce();
    expect(s.states.at(-1)?.error).toMatchObject({ message: "Denied" });
    s.owner.dispose();
  });

  it("rejects late A1 repaint across A→B→A owner generations", async () => {
    const a1 = deferred<string>();
    const b1 = deferred<string>();
    const a2 = deferred<string>();
    const a1States: Array<LiveMapRefreshState<string>> = [];
    const bStates: Array<LiveMapRefreshState<string>> = [];
    const a2States: Array<LiveMapRefreshState<string>> = [];
    const ownerA1 = new LiveMapRefreshOwner({
      load: () => a1.promise,
      onState: (state) => a1States.push(state),
    });
    ownerA1.setActive(true);
    ownerA1.dispose();
    const ownerB = new LiveMapRefreshOwner({
      load: () => b1.promise,
      onState: (state) => bStates.push(state),
    });
    ownerB.setActive(true);
    ownerB.dispose();
    const ownerA2 = new LiveMapRefreshOwner({
      load: () => a2.promise,
      onState: (state) => a2States.push(state),
    });
    ownerA2.setActive(true);

    a1.resolve("A1 stale");
    b1.resolve("B1 stale");
    a2.resolve("A2 current");
    await Promise.all([a1.promise, b1.promise, a2.promise]);
    await Promise.resolve();
    expect(a1States.some((state) => state.data === "A1 stale")).toBe(false);
    expect(bStates.some((state) => state.data === "B1 stale")).toBe(false);
    expect(a2States.at(-1)?.data).toBe("A2 current");
    ownerA2.dispose();
  });

  it("replaces marker truth on each successful poll without retaining ended rows", async () => {
    vi.useFakeTimers();
    const first = Promise.resolve([{ id: "task", freshness: "LIVE" }]);
    const second = Promise.resolve([{ id: "task", freshness: "STALE" }]);
    const third = Promise.resolve([] as Array<{ id: string; freshness: string }>);
    const s = setup([first, second, third]);
    s.owner.setActive(true);
    await first;
    await Promise.resolve();
    expect(s.states.at(-1)?.data).toEqual([{ id: "task", freshness: "LIVE" }]);
    await vi.advanceTimersByTimeAsync(liveMapPollDelayMs);
    await second;
    await Promise.resolve();
    expect(s.states.at(-1)?.data).toEqual([{ id: "task", freshness: "STALE" }]);
    await vi.advanceTimersByTimeAsync(liveMapPollDelayMs);
    await third;
    await Promise.resolve();
    expect(s.states.at(-1)?.data).toEqual([]);
    s.owner.dispose();
  });
});
