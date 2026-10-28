import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

const control = vi.hoisted(() => ({
  mode: "normal",
  last: undefined as unknown,
}));
vi.mock("node:worker_threads", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:worker_threads")>();
  return {
    ...original,
    Worker: class {
      constructor(
        filename: string,
        options: import("node:worker_threads").WorkerOptions,
      ) {
        if (control.mode === "startFailure")
          throw new Error("controlled startup failure");
        if (control.mode === "hang") {
          const worker = new EventEmitter() as EventEmitter & {
            terminate: () => Promise<number>;
          };
          worker.terminate = vi.fn(async () => 0);
          control.last = worker;
          return worker;
        }
        if (control.mode === "crash")
          return new original.Worker(
            "throw new Error('controlled worker crash')",
            { eval: true },
          );
        if (control.mode === "exit")
          return new original.Worker("process.exit(0)", { eval: true });
        return new original.Worker(filename, options);
      }
    },
  };
});

import { canonicalizeConditionJpeg } from "../src/modules/vehicle-photos/condition-photo-jpeg-decoder";
import { conditionPhotoProcessingMetrics as metrics } from "../src/modules/vehicle-photos/condition-photo-processing-metrics";
import sharp from "sharp";

async function image() {
  return await sharp({
    create: { width: 16, height: 12, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
}

afterEach(() => {
  control.mode = "normal";
  vi.useRealTimers();
});

describe("isolated Worker failure and cancellation cleanup", () => {
  it.each(["crash", "exit", "startFailure"])(
    "recovers capacity after %s",
    async (mode) => {
      const bytes = await image();
      control.mode = mode;
      await expect(canonicalizeConditionJpeg(bytes)).rejects.toMatchObject({
        code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE",
      });
      expect(metrics.active).toBe(0);
      control.mode = "normal";
      expect(await canonicalizeConditionJpeg(bytes)).toMatchObject({
        width: 16,
        height: 12,
      });
    },
  );

  it("terminates timed-out processing before releasing capacity", async () => {
    const bytes = await image();
    vi.useFakeTimers();
    control.mode = "hang";
    const result = expect(
      canonicalizeConditionJpeg(bytes),
    ).rejects.toMatchObject({ code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE" });
    expect(metrics.active).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(
      (control.last as { terminate: unknown }).terminate,
    ).toHaveBeenCalledOnce();
    expect(metrics.active).toBe(0);
    expect(metrics.failures.processingTimeout).toBeGreaterThan(0);
  });

  it("terminates decoding when the client disconnects and then permits another job", async () => {
    const bytes = await image();
    control.mode = "hang";
    const cancellation = new AbortController();
    const result = expect(
      canonicalizeConditionJpeg(bytes, cancellation.signal),
    ).rejects.toMatchObject({ code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE" });
    cancellation.abort();
    await result;
    expect(
      (control.last as { terminate: unknown }).terminate,
    ).toHaveBeenCalledOnce();
    expect(metrics.active).toBe(0);
    control.mode = "normal";
    expect(await canonicalizeConditionJpeg(bytes)).toMatchObject({ width: 16 });
  });
  it("cancels and terminates a real Worker during decoding", async () => {
    const bytes = await image();
    const cancellation = new AbortController();
    const result = expect(
      canonicalizeConditionJpeg(bytes, cancellation.signal),
    ).rejects.toMatchObject({ code: "CONDITION_PHOTO_STORAGE_UNAVAILABLE" });
    cancellation.abort();
    await result;
    expect(metrics.active).toBe(0);
    expect(await canonicalizeConditionJpeg(bytes)).toMatchObject({ width: 16 });
  });
});
