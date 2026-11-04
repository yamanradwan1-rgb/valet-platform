import { describe, expect, it, vi } from "vitest";
import type { ManagementAlertPreview } from "./alert-model";
import { AlertPollOwner } from "./alert-poll-owner";
import { readWithAlertTransportLease } from "./alert-read-lease";

const preview: ManagementAlertPreview = { items: [], count: 0, hasMore: false };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Management Alert read lease across remount", () => {
  it("never overlaps an abort-ignoring A1 GET with remounted B or A2", async () => {
    vi.useFakeTimers();
    try {
      const old = deferred<ManagementAlertPreview>();
      const fresh = deferred<ManagementAlertPreview>();
      const transport = vi
        .fn()
        .mockImplementationOnce(() => old.promise)
        .mockImplementationOnce(() => fresh.promise);
      const stateA = vi.fn();
      const stateB = vi.fn();
      const makeOwner = (onState: typeof stateA) =>
        new AlertPollOwner({
          load: (signal) =>
            readWithAlertTransportLease(signal, () => true, transport),
          currentAuthority: () => true,
          onState,
          jitter: () => 0,
        });
      const ownerA = makeOwner(stateA);
      ownerA.setForeground(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport).toHaveBeenCalledTimes(1);

      ownerA.dispose(); // old request ignores the aborted signal
      const ownerB = makeOwner(stateB);
      ownerB.setForeground(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport).toHaveBeenCalledTimes(1);
      ownerB.dispose();

      const ownerA2 = makeOwner(stateB);
      ownerA2.setForeground(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport).toHaveBeenCalledTimes(1);
      old.resolve(preview);
      await vi.advanceTimersByTimeAsync(0);
      expect(transport).toHaveBeenCalledTimes(2);
      expect(stateA).not.toHaveBeenCalledWith({ status: "ready", preview });
      fresh.resolve(preview);
      await vi.advanceTimersByTimeAsync(0);
      expect(stateB).toHaveBeenLastCalledWith({ status: "ready", preview });
      ownerA2.dispose();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("never dispatches queued B after live authority is revoked without abort", async () => {
    const old = deferred<ManagementAlertPreview>();
    const transport = vi.fn().mockImplementationOnce(() => old.promise);
    let authorityB = true;
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    const runningA = readWithAlertTransportLease(
      controllerA.signal,
      () => true,
      transport,
    );
    await Promise.resolve();
    expect(transport).toHaveBeenCalledTimes(1);
    const queuedB = readWithAlertTransportLease(
      controllerB.signal,
      () => authorityB,
      transport,
    );
    authorityB = false;
    old.resolve(preview);
    await expect(runningA).resolves.toEqual(preview);
    await expect(queuedB).rejects.toThrow("authority changed");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("prunes aborted queued owners even if the active read ignores abort", async () => {
    vi.useFakeTimers();
    try {
      const old = deferred<ManagementAlertPreview>();
      const transport = vi
        .fn()
        .mockImplementationOnce(() => old.promise)
        .mockResolvedValue(preview);
      const controllerA = new AbortController();
      const controllerB = new AbortController();
      const runningA = readWithAlertTransportLease(
        controllerA.signal,
        () => true,
        transport,
      );
      await vi.advanceTimersByTimeAsync(0);
      const queuedB = readWithAlertTransportLease(
        controllerB.signal,
        () => true,
        transport,
      );
      const denied = expect(queuedB).rejects.toThrow("cancelled");
      controllerB.abort();
      await denied;
      // An actual noncooperative transport cannot be forcibly released
      // without permitting overlapping protected reads. Remain fail-closed.
      await vi.advanceTimersByTimeAsync(70_000);
      expect(transport).toHaveBeenCalledTimes(1);
      controllerA.abort();
      old.resolve(preview);
      await runningA;
      const controllerC = new AbortController();
      await expect(
        readWithAlertTransportLease(controllerC.signal, () => true, transport),
      ).resolves.toEqual(preview);
      expect(transport).toHaveBeenCalledTimes(2);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
