import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlateOcrResponse } from "@valet/employee-client";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";

const match: PlateOcrResponse = {
  status: "MATCH",
  candidate: { plateNumberRaw: "12-34567", confidence: 1 },
};

function setup() {
  const capture = vi.fn(async () => "cache://transient.jpg");
  const recognize = vi
    .fn<(uri: string, signal: AbortSignal) => Promise<PlateOcrResponse>>()
    .mockResolvedValue({ status: "NO_MATCH" });
  const remove = vi.fn(async () => undefined);
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
  return { accept, capture, controller, open, recognize, remove };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Native explicit bounded OCR", () => {
  it("does no capture or OCR work from open, readiness, or elapsed time", async () => {
    const c = setup();
    await c.open();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(c.capture).not.toHaveBeenCalled();
    expect(c.recognize).not.toHaveBeenCalled();
  });

  it("runs exactly one attempt for one explicit capture", async () => {
    const c = setup();
    await c.open();
    c.controller.capture();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.recognize).toHaveBeenCalledOnce();
    expect(c.remove).toHaveBeenCalledExactlyOnceWith("cache://transient.jpg");
    expect(c.controller.current().phase).toBe("no-match");
  });

  it("fences double capture synchronously", async () => {
    const c = setup();
    let finish!: (value: string) => void;
    c.capture.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await c.open();
    c.controller.capture();
    c.controller.capture();
    expect(c.capture).toHaveBeenCalledOnce();
    finish("cache://transient.jpg");
    await vi.advanceTimersByTimeAsync(0);
    expect(c.recognize).toHaveBeenCalledOnce();
  });

  it("shows a candidate for review without confirming identity", async () => {
    const c = setup();
    c.recognize.mockResolvedValueOnce(match);
    await c.open();
    c.controller.capture();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.accept).toHaveBeenCalledExactlyOnceWith("12-34567");
    expect(c.controller.current().phase).toBe("idle");
  });

  it("invalidates a late result and cleans the transient file", async () => {
    const c = setup();
    let finish!: (value: PlateOcrResponse) => void;
    c.recognize.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    await c.open();
    c.controller.capture();
    await vi.advanceTimersByTimeAsync(0);
    c.controller.close();
    expect(c.recognize.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(c.remove).toHaveBeenCalledOnce();
    finish(match);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.accept).not.toHaveBeenCalled();
  });
});
