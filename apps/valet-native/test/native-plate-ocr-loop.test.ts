import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlateOcrResponse } from "@valet/employee-client";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";
import {
  NATIVE_PLATE_OCR_INTERVAL_MS,
  NATIVE_PLATE_OCR_MAX_ATTEMPTS,
} from "../src/check-in/native-plate-ocr-loop";

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

// DEC-074: final camera readiness MUST start bounded assistive OCR automatically.
// Requiring manual Capture here would change an Accepted product contract.
describe("DEC-074 automatic bounded Native OCR invariant", () => {
  it("starts assistive OCR automatically only after final camera readiness and the interval", async () => {
    const c = setup();
    await c.controller.open();
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS * 2);
    expect(c.capture).not.toHaveBeenCalled();

    c.controller.ready(c.controller.current().generation);
    c.controller.ready(c.controller.current().generation);
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS - 1);
    expect(c.capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.recognize).toHaveBeenCalledOnce();
  });

  it("retries NO_MATCH at most five spaced attempts", async () => {
    const c = setup();
    await c.open();
    for (let attempt = 1; attempt <= NATIVE_PLATE_OCR_MAX_ATTEMPTS; attempt++) {
      await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS - 1);
      expect(c.capture).toHaveBeenCalledTimes(attempt - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(c.capture).toHaveBeenCalledTimes(attempt);
    }
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS * 2);
    expect(c.capture).toHaveBeenCalledTimes(NATIVE_PLATE_OCR_MAX_ATTEMPTS);
    expect(c.recognize).toHaveBeenCalledTimes(NATIVE_PLATE_OCR_MAX_ATTEMPTS);
    expect(c.remove).toHaveBeenCalledTimes(NATIVE_PLATE_OCR_MAX_ATTEMPTS);
    expect(c.controller.current().phase).toBe("no-match");
  });

  it("never overlaps capture or recognition while an attempt is active", async () => {
    const c = setup();
    let captured!: (uri: string) => void;
    c.capture.mockReturnValueOnce(
      new Promise((resolve) => {
        captured = resolve;
      }),
    );
    await c.open();
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS * 10);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.recognize).not.toHaveBeenCalled();

    let recognized!: (result: PlateOcrResponse) => void;
    c.recognize.mockReturnValueOnce(
      new Promise((resolve) => {
        recognized = resolve;
      }),
    );
    captured("cache://transient.jpg");
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS * 10);
    expect(c.recognize).toHaveBeenCalledOnce();
    expect(c.capture).toHaveBeenCalledOnce();
    recognized({ status: "NO_MATCH" });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS);
    expect(c.capture).toHaveBeenCalledTimes(2);
  });

  it("MATCH stops retries and accepts the candidate exactly once", async () => {
    const c = setup();
    c.recognize.mockResolvedValueOnce(match);
    await c.open();
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS * 10);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.accept).toHaveBeenCalledExactlyOnceWith("12-34567");
    expect(c.controller.current().phase).toBe("idle");
  });

  it("UNAVAILABLE stops retries and exposes the terminal fallback state", async () => {
    const c = setup();
    c.recognize.mockResolvedValueOnce({ status: "UNAVAILABLE" });
    await c.open();
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS * 10);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.controller.current().phase).toBe("unavailable");
  });

  it("close cancels a pending timer", async () => {
    const c = setup();
    await c.open();
    c.controller.close();
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS * 2);
    expect(c.capture).not.toHaveBeenCalled();
  });

  it("close aborts active work and a stale result cannot mutate a new generation", async () => {
    const c = setup();
    let finish!: (value: PlateOcrResponse) => void;
    c.recognize.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await c.open();
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS);
    c.controller.close();
    expect(c.recognize.mock.calls[0]?.[1].aborted).toBe(true);
    expect(c.remove).toHaveBeenCalledOnce();
    await c.controller.open();
    c.controller.ready(c.controller.current().generation);
    finish(match);
    await vi.advanceTimersByTimeAsync(NATIVE_PLATE_OCR_INTERVAL_MS * 2);
    expect(c.accept).not.toHaveBeenCalled();
  });
});
