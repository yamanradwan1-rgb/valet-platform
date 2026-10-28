import { afterEach, describe, expect, it, vi } from "vitest";

import { ConditionPhotoDecodeQueue } from "../src/modules/vehicle-photos/condition-photo-decode-queue";
import { ConditionPhotoProcessingMetrics } from "../src/modules/vehicle-photos/condition-photo-processing-metrics";

function deferred() {
  let resolve!: (value: number) => void;
  const promise = new Promise<number>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

describe("bounded FIFO JPEG admission", () => {
  it("retains two active jobs, two bounded waiters and serves them FIFO", async () => {
    const metrics = new ConditionPhotoProcessingMetrics();
    const queue = new ConditionPhotoDecodeQueue(metrics);
    const gates = Array.from({ length: 4 }, deferred);
    const order: number[] = [];
    const jobs = gates.map((gate, index) =>
      queue.execute(8 * 1024 * 1024, async () => {
        order.push(index);
        return await gate.promise;
      }),
    );
    expect(order).toEqual([0, 1]);
    expect(metrics.snapshot()).toMatchObject({
      active: 2,
      waiting: 2,
      queuedBytes: 16 * 1024 * 1024,
    });
    await expect(queue.execute(1, async () => 5)).rejects.toMatchObject({
      code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE",
    });
    gates[1]!.resolve(1);
    await jobs[1];
    expect(order).toEqual([0, 1, 2]);
    gates[0]!.resolve(0);
    await jobs[0];
    expect(order).toEqual([0, 1, 2, 3]);
    gates[2]!.resolve(2);
    gates[3]!.resolve(3);
    expect(await Promise.all(jobs)).toEqual([0, 1, 2, 3]);
    expect(metrics.snapshot()).toMatchObject({
      active: 0,
      waiting: 0,
      queuedBytes: 0,
      failures: { queueFull: 1 },
    });
  });

  it("expires queued work without executing it or leaking a slot", async () => {
    vi.useFakeTimers();
    const metrics = new ConditionPhotoProcessingMetrics();
    const queue = new ConditionPhotoDecodeQueue(metrics);
    const gate = deferred();
    const active = [
      queue.execute(1, () => gate.promise),
      queue.execute(1, () => gate.promise),
    ];
    const run = vi.fn(async () => 3);
    const waiting = expect(queue.execute(1, run)).rejects.toMatchObject({
      code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE",
    });
    await vi.advanceTimersByTimeAsync(5000);
    await waiting;
    expect(run).not.toHaveBeenCalled();
    expect(metrics.waiting).toBe(0);
    expect(metrics.failures.queueExpired).toBe(1);
    gate.resolve(1);
    await Promise.all(active);
    expect(await queue.execute(1, run)).toBe(3);
  });

  it("removes a disconnected waiter and admits the next independent request", async () => {
    const metrics = new ConditionPhotoProcessingMetrics();
    const queue = new ConditionPhotoDecodeQueue(metrics);
    const gate = deferred();
    const active = [
      queue.execute(1, () => gate.promise),
      queue.execute(1, () => gate.promise),
    ];
    const cancellation = new AbortController();
    const run = vi.fn(async () => 3);
    const waiting = expect(
      queue.execute(1, run, cancellation.signal),
    ).rejects.toMatchObject({ code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE" });
    cancellation.abort();
    await waiting;
    expect(run).not.toHaveBeenCalled();
    expect(metrics.queuedBytes).toBe(0);
    const next = queue.execute(1, async () => 4);
    gate.resolve(1);
    await Promise.all(active);
    expect(await next).toBe(4);
    expect(metrics.snapshot()).toMatchObject({
      active: 0,
      waiting: 0,
      failures: { cancelled: 1 },
    });
  });

  it("recovers from failed work and rejects pre-cancelled work without allocation", async () => {
    const metrics = new ConditionPhotoProcessingMetrics();
    const queue = new ConditionPhotoDecodeQueue(metrics);
    await expect(
      queue.execute(1, async () => {
        throw new Error("controlled failure");
      }),
    ).rejects.toThrow("controlled failure");
    const cancelled = new AbortController();
    cancelled.abort();
    const run = vi.fn(async () => 2);
    await expect(queue.execute(1, run, cancelled.signal)).rejects.toMatchObject(
      { code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE" },
    );
    expect(run).not.toHaveBeenCalled();
    expect(await queue.execute(1, run)).toBe(2);
    expect(metrics.active).toBe(0);
  });
});
