import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { ManagementAlertPreview } from "./alert-model";
import { AlertPollOwner, type AlertPollState } from "./alert-poll-owner";

const empty: ManagementAlertPreview = { items: [], count: 0, hasMore: false };
const stale: ManagementAlertPreview = {
  items: [{
    id: "old-alert",
    category: "ALT-08",
    severity: "CRITICAL",
    sourceKind: "INCIDENT",
    sourceId: "incident-old",
    episodeId: "episode-old",
    locationId: "location-old",
    occurredAt: "2026-11-04T08:00:00.000Z",
    title: "Old scope incident",
  }],
  count: 1,
  hasMore: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup(load: (signal: AbortSignal) => Promise<ManagementAlertPreview>) {
  const onState = vi.fn<(state: AlertPollState) => void>();
  let current = true;
  const owner = new AlertPollOwner({
    load,
    currentAuthority: () => current,
    onState,
    jitter: () => 0,
  });
  return { owner, onState, revoke: () => { current = false; } };
}

describe("foreground Management Alerts poll", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("coalesces refresh while one protected request is pending", async () => {
    const pending = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(load).toHaveBeenCalledTimes(1);
    const joined = s.owner.refresh();
    expect(load).toHaveBeenCalledTimes(1);
    pending.resolve(empty);
    await joined;
    s.owner.dispose();
  });

  it("schedules the next read after the previous request settles", async () => {
    const pending = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => pending.promise)
      .mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(load).toHaveBeenCalledTimes(1);
    pending.resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "ready", preview: empty,
    });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(2);
    s.owner.dispose();
  });

  it("holds A1 in-flight across A→B→A until stale success settles", async () => {
    const a1 = deferred<ManagementAlertPreview>();
    const a2 = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => a1.promise)
      .mockImplementationOnce(() => a2.promise);
    const s = setup(load);
    s.owner.setForeground(true);
    await Promise.resolve();
    s.owner.setForeground(false);
    s.owner.setForeground(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "unavailable", preview: null,
    });
    a1.resolve(stale);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(s.onState).not.toHaveBeenCalledWith({
      status: "ready", preview: stale,
    });
    a2.resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "ready", preview: empty,
    });
    s.owner.dispose();
  });

  it("waits for an abort-ignoring read before refreshing changed preferences", async () => {
    const old = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => old.promise)
      .mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    await Promise.resolve();
    s.owner.invalidatePreferences();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    s.owner.invalidatePreferences();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    old.reject(new Error("Old response ignored"));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "ready", preview: empty,
    });
    s.owner.dispose();
  });

  it("pauses while hidden and starts exactly one fresh read after old settlement", async () => {
    const old = deferred<ManagementAlertPreview>();
    const fresh = deferred<ManagementAlertPreview>();
    const load = vi.fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => fresh.promise);
    const s = setup(load);
    s.owner.setForeground(true);
    await Promise.resolve();
    s.owner.setForeground(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(load).toHaveBeenCalledTimes(1);
    old.resolve(stale);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(s.onState).not.toHaveBeenCalledWith({
      status: "ready", preview: stale,
    });
    s.owner.setForeground(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    fresh.resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "ready", preview: empty,
    });
    s.owner.dispose();
  });

  it("suspends on MFA denial until user-driven recovery", async () => {
    const mfa = new DashboardApiError({
      kind: "mfa", status: 403, message: "MFA required",
    });
    const load = vi.fn().mockRejectedValueOnce(mfa).mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "suspended", preview: null,
    });
    s.owner.setForeground(false);
    s.owner.setForeground(true);
    s.owner.invalidatePreferences();
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "suspended", preview: null,
    });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(load).toHaveBeenCalledTimes(1);
    await s.owner.recover();
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "ready", preview: empty,
    });
    s.owner.dispose();
  });

  it("backs off transient 429/5xx and never turns failure into zero", async () => {
    const err = new DashboardApiError({
      kind: "unknown", status: 503, message: "Unavailable",
    });
    const load = vi.fn().mockRejectedValueOnce(err).mockRejectedValueOnce(err)
      .mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "unavailable", preview: null,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(3);
    s.owner.dispose();
  });

  it("clears on lost authority and stops reads", async () => {
    const load = vi.fn().mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    await vi.advanceTimersByTimeAsync(0);
    s.revoke();
    s.owner.setForeground(false);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "unavailable", preview: null,
    });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(load).toHaveBeenCalledTimes(1);
    s.owner.dispose();
  });

  it("does not even dispatch a queued read after disposal before first microtask", async () => {
    const load = vi.fn().mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    s.owner.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).not.toHaveBeenCalled();
  });

  it("does not overlap a deadline-aborted request that ignores abort", async () => {
    const stuck = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => stuck.promise)
      .mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "unavailable", preview: null,
    });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(load).toHaveBeenCalledTimes(1);
    stuck.resolve(stale);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).not.toHaveBeenCalledWith({
      status: "ready", preview: stale,
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
    s.owner.dispose();
  });

  it("does not start A2 until A1's non-cooperative late error settles", async () => {
    const old = deferred<ManagementAlertPreview>();
    const next = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => next.promise);
    const s = setup(load);
    s.owner.setForeground(true);
    await Promise.resolve();
    s.owner.setForeground(false);
    s.owner.setForeground(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    old.reject(new Error("stale protected error"));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "loading", preview: null,
    });
    next.resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "ready", preview: empty,
    });
    s.owner.dispose();
  });
});
