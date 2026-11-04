import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import type { ManagementAlertPreview } from "./alert-model";
import { AlertPollOwner, type AlertPollState } from "./alert-poll-owner";

const empty: ManagementAlertPreview = { items: [], count: 0, hasMore: false };
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

  it("discards stale A1 across A→B→A and never paints late success", async () => {
    const a1 = deferred<ManagementAlertPreview>();
    const a2 = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => a1.promise)
      .mockImplementationOnce(() => a2.promise);
    const s = setup(load);
    s.owner.setForeground(true);
    await Promise.resolve();
    s.owner.setForeground(false);
    s.owner.setForeground(true);
    await Promise.resolve();
    a1.resolve({ items: [], count: 13, hasMore: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).not.toHaveBeenCalledWith({
      status: "ready",
      preview: { items: [], count: 13, hasMore: false },
    });
    a2.resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "ready", preview: empty,
    });
    s.owner.dispose();
  });

  it("retires in-flight data and re-reads once after a preference revision", async () => {
    const old = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => old.promise)
      .mockResolvedValue(empty);
    const s = setup(load);
    s.owner.setForeground(true);
    await Promise.resolve();
    s.owner.invalidatePreferences();
    await vi.advanceTimersByTimeAsync(0);
    old.reject(new Error("Old response ignored"));
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(2);
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
    stuck.resolve({ items: [], count: 12, hasMore: false });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).not.toHaveBeenCalledWith({
      status: "ready",
      preview: { items: [], count: 12, hasMore: false },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(load).toHaveBeenCalledTimes(2);
    s.owner.dispose();
  });

  it("drops late non-cooperative error after A→B→A", async () => {
    const old = deferred<ManagementAlertPreview>();
    const next = deferred<ManagementAlertPreview>();
    const load = vi.fn().mockImplementationOnce(() => old.promise)
      .mockImplementationOnce(() => next.promise);
    const s = setup(load);
    s.owner.setForeground(true);
    await Promise.resolve();
    s.owner.setForeground(false);
    s.owner.setForeground(true);
    await Promise.resolve();
    old.reject(new Error("stale protected error"));
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).not.toHaveBeenCalledWith({
      status: "unavailable", preview: old.promise,
    });
    next.resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.onState).toHaveBeenLastCalledWith({
      status: "ready", preview: empty,
    });
    s.owner.dispose();
  });
});
