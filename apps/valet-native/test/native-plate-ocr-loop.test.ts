import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlateOcrResponse } from "@valet/employee-client";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";

const match: PlateOcrResponse = {
  status: "MATCH",
  candidate: { plateNumberRaw: "12-34567", confidence: 1 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function setup() {
  const capture = vi.fn(async () => "cache://transient.jpg");
  const recognize = vi
    .fn<(uri: string, signal: AbortSignal) => Promise<PlateOcrResponse>>()
    .mockResolvedValue({ status: "NO_MATCH" });
  const remove = vi.fn(async (): Promise<void> => undefined);
  const accept = vi.fn();
  const controller = new NativePlateCameraController(
    {
      get: async () => ({ granted: true, canAskAgain: true }),
      request: async () => ({ granted: true, canAskAgain: true }),
    },
    { accept, capture, recognize, remove },
  );
  controller.setEligible(true);
  const open = async () => {
    await controller.open();
    controller.ready(controller.current().generation);
  };
  const press = () => {
    const { generation, mountId } = controller.current();
    return controller.capture(generation, mountId);
  };
  return { accept, capture, controller, open, press, recognize, remove };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("DEC-074 explicit Native OCR capture", () => {
  it("open, readiness, duplicate readiness and time never capture", async () => {
    const c = setup();
    await c.open();
    c.controller.ready(c.controller.current().generation);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(c.capture).not.toHaveBeenCalled();
    expect(c.recognize).not.toHaveBeenCalled();
    expect(c.press()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.recognize).toHaveBeenCalledOnce();
  });

  it("NO_MATCH finishes cleanup before second explicit press on the same preview", async () => {
    const c = setup();
    await c.open();
    const original = c.controller.current();
    const cleanup = deferred<void>();
    c.remove.mockReturnValueOnce(cleanup.promise);
    expect(c.press()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.controller.current()).toMatchObject({
      phase: "preview",
      captureBusy: true,
      generation: original.generation,
      mountId: original.mountId,
    });
    expect(c.press()).toBe(false);
    expect(c.capture).toHaveBeenCalledOnce();
    cleanup.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.controller.current()).toMatchObject({
      phase: "preview",
      captureBusy: false,
      noMatchSinceCapture: true,
      generation: original.generation,
      mountId: original.mountId,
    });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.press()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.capture).toHaveBeenCalledTimes(2);
    expect(c.recognize).toHaveBeenCalledTimes(2);
    expect(c.remove).toHaveBeenCalledTimes(2);
  });

  it("never overlaps capture or POST during rapid taps and cleanup", async () => {
    const c = setup();
    const picture = deferred<string>();
    const provider = deferred<PlateOcrResponse>();
    const cleanup = deferred<void>();
    c.capture.mockReturnValueOnce(picture.promise);
    c.recognize.mockReturnValueOnce(provider.promise);
    c.remove.mockReturnValueOnce(cleanup.promise);
    await c.open();
    expect(c.press()).toBe(true);
    expect(c.press()).toBe(false);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(c.recognize).not.toHaveBeenCalled();
    picture.resolve("cache://transient.jpg");
    await vi.advanceTimersByTimeAsync(0);
    expect(c.recognize).toHaveBeenCalledOnce();
    expect(c.press()).toBe(false);
    provider.resolve({ status: "NO_MATCH" });
    await vi.advanceTimersByTimeAsync(0);
    expect(c.press()).toBe(false);
    cleanup.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.press()).toBe(true);
  });

  it("MATCH accepts only after cleanup; no automatic following capture", async () => {
    const c = setup();
    c.recognize.mockResolvedValueOnce(match);
    await c.open();
    expect(c.press()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.accept).toHaveBeenCalledExactlyOnceWith("12-34567");
    expect(c.controller.current().phase).toBe("idle");
    await vi.advanceTimersByTimeAsync(50_000);
    expect(c.capture).toHaveBeenCalledOnce();
  });

  it("UNAVAILABLE and cleanup failure close preview for deliberate recovery", async () => {
    const c = setup();
    c.recognize.mockResolvedValueOnce({ status: "UNAVAILABLE" });
    await c.open();
    c.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.controller.current().phase).toBe("unavailable");
    await c.controller.open();
    c.controller.ready(c.controller.current().generation);
    c.remove.mockRejectedValueOnce(new Error("cleanup failed"));
    c.press();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.controller.current().phase).toBe("unavailable");
    expect(c.capture).toHaveBeenCalledTimes(2);
  });

  it("capture rejection sends zero HTTP and never retries", async () => {
    const c = setup();
    c.capture.mockRejectedValueOnce(new Error("capture failed"));
    await c.open();
    expect(c.press()).toBe(true);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.recognize).not.toHaveBeenCalled();
    expect(c.controller.current().phase).toBe("unavailable");
  });

  it("close aborts stale POST, cleans late file and does not accept into reopened generation", async () => {
    const c = setup();
    const finished = deferred<PlateOcrResponse>();
    c.recognize.mockReturnValueOnce(finished.promise);
    await c.open();
    c.press();
    await vi.advanceTimersByTimeAsync(0);
    const aborted = c.recognize.mock.calls[0]![1];
    c.controller.close();
    expect(aborted.aborted).toBe(true);
    await c.open();
    expect(c.press()).toBe(false); // canceled work still owns the slot
    finished.resolve(match);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.accept).not.toHaveBeenCalled();
    expect(c.controller.current().phase).toBe("preview");
    expect(c.press()).toBe(true);
  });

  it("a stale capture created after close is removed and never posted", async () => {
    const c = setup();
    const picture = deferred<string>();
    c.capture.mockReturnValueOnce(picture.promise);
    await c.open();
    c.press();
    c.controller.close();
    picture.resolve("cache://late.jpg");
    await vi.advanceTimersByTimeAsync(0);
    expect(c.remove).toHaveBeenCalledWith("cache://late.jpg");
    expect(c.recognize).not.toHaveBeenCalled();
    expect(c.accept).not.toHaveBeenCalled();
  });
});
