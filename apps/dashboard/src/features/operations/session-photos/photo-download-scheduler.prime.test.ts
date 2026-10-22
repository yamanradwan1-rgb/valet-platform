import { describe, expect, it, vi } from "vitest";
import { acquireSessionPhotosInOrder } from "./photo-download-scheduler";

describe("#309 invisible bounded private-photo acquisition", () => {
  it("keeps empty and single-photo galleries at zero or one request", async () => {
    const read = vi.fn(async (item: number) => item);
    const signal = new AbortController().signal;
    expect(await acquireSessionPhotosInOrder([], read, signal)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
    expect(await acquireSessionPhotosInOrder([10], read, signal)).toEqual([10]);
    expect(read).toHaveBeenCalledTimes(1);
  });

  for (const count of [2, 5, 10]) {
    it(`never exceeds two reads and preserves original order for ${count} photos`, async () => {
      let active = 0;
      let maximum = 0;
      const completion: number[] = [];
      const actual = await acquireSessionPhotosInOrder(
        Array.from({ length: count }, (_, i) => i),
        async (item) => {
          active++;
          maximum = Math.max(maximum, active);
          // The first request is deliberately slower than the second.
          await new Promise<void>((resolve) => setTimeout(resolve, item === 0 ? 15 : 1));
          completion.push(item);
          active--;
          return `photo-${item}`;
        },
        new AbortController().signal,
      );
      expect(maximum).toBe(Math.min(2, count));
      expect(completion[0]).not.toBe(0);
      expect(actual).toEqual(Array.from({ length: count }, (_, i) => `photo-${i}`));
      expect(active).toBe(0);
    });
  }

  it("aborts other reads on first failure, and never returns partial results", async () => {
    const failure = new Error("private provider unavailable");
    let siblingAborted = false;
    const read = vi.fn(async (photo: number, _index: number, signal: AbortSignal) => {
      if (photo === 0) {
        await Promise.resolve();
        throw failure;
      }
      return await new Promise<number>((_resolve, reject) => {
        if (signal.aborted) {
          siblingAborted = true;
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          siblingAborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    });
    await expect(acquireSessionPhotosInOrder([0, 1, 2], read, new AbortController().signal)).rejects.toBe(failure);
    expect(siblingAborted).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("does not start or publish reads after visit/scope cancellation", async () => {
    const controller = new AbortController();
    const read = vi.fn(async (_photo: number, _index: number, signal: AbortSignal): Promise<number> =>
      await new Promise((_resolve, reject) => {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      }));
    const pending = acquireSessionPhotosInOrder([0, 1, 2, 3, 4], read, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(read).toHaveBeenCalledTimes(2);
    await expect(acquireSessionPhotosInOrder([0], read, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("preserves a rate-limited failure without retrying or publishing a gallery", async () => {
    const throttled = Object.assign(new Error("rate limited"), { status: 429 });
    const read = vi.fn(async () => { throw throttled; });
    await expect(acquireSessionPhotosInOrder([0, 1, 2, 3], read, new AbortController().signal)).rejects.toBe(throttled);
    expect(read.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
