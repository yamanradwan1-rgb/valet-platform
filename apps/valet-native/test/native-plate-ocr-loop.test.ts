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
    { capture, recognize, remove, accept },
  );
  controller.setEligible(true);
  const open = async () => {
    await controller.open();
    controller.ready(controller.current().generation);
  };
  return { controller, capture, recognize, remove, accept, open };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe("Native bounded automatic OCR", () => {
  it("waits for camera readiness, spaces attempts and stops at five", async () => {
    const c = setup();
    await c.controller.open();
    await vi.advanceTimersByTimeAsync(10000);
    expect(c.capture).not.toHaveBeenCalled();
    c.controller.ready(c.controller.current().generation);
    await vi.advanceTimersByTimeAsync(1199);
    expect(c.capture).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(c.capture).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(12000);
    expect(c.capture).toHaveBeenCalledTimes(5);
    expect(c.recognize).toHaveBeenCalledTimes(5);
    expect(c.remove).toHaveBeenCalledTimes(5);
    expect(c.controller.current().phase).toBe("no-match");
    await c.open();
    await vi.advanceTimersByTimeAsync(6000);
    expect(c.capture).toHaveBeenCalledTimes(10);
  });
  it("never overlaps capture or uploads and has no frame backlog", async () => {
    const c = setup();
    let captured!: (value: string) => void;
    c.capture.mockReturnValueOnce(
      new Promise((resolve) => {
        captured = resolve;
      }),
    );
    let returned!: (value: PlateOcrResponse) => void;
    c.recognize.mockReturnValueOnce(
      new Promise((resolve) => {
        returned = resolve;
      }),
    );
    await c.open();
    await vi.advanceTimersByTimeAsync(20000);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.recognize).not.toHaveBeenCalled();
    captured("cache://transient.jpg");
    await vi.advanceTimersByTimeAsync(20000);
    expect(c.recognize).toHaveBeenCalledOnce();
    returned(match);
    await vi.advanceTimersByTimeAsync(20000);
    expect(c.capture).toHaveBeenCalledOnce();
    expect(c.accept).toHaveBeenCalledExactlyOnceWith("12-34567");
    expect(c.controller.current().phase).toBe("idle");
    expect(c.remove).toHaveBeenCalledOnce();
  });
  it.each([
    "MATCH",
    "NO_MATCH",
    "UNAVAILABLE",
    "transport-error",
    "parse-error",
  ])("deletes temporary image after %s", async (outcome) => {
    const c = setup();
    if (outcome === "transport-error" || outcome === "parse-error")
      c.recognize.mockRejectedValueOnce(new Error(outcome));
    else
      c.recognize.mockResolvedValueOnce(
        outcome === "MATCH"
          ? match
          : { status: outcome as "NO_MATCH" | "UNAVAILABLE" },
      );
    await c.open();
    await vi.advanceTimersByTimeAsync(1200);
    expect(c.remove).toHaveBeenCalledExactlyOnceWith("cache://transient.jpg");
    c.controller.close();
  });
  it.each([
    "close",
    "manual",
    "no-plate",
    "back",
    "unmount",
    "workflow",
    "auth",
    "retry",
  ])(
    "invalidates late MATCH and promptly deletes the captured file on %s",
    async (exit) => {
      const c = setup();
      let finish!: (value: PlateOcrResponse) => void;
      c.recognize.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      await c.open();
      await vi.advanceTimersByTimeAsync(1200);
      const old = c.controller.current().generation;
      if (["workflow", "auth", "unmount", "back"].includes(exit))
        c.controller.setEligible(false);
      else c.controller.close();
      expect(c.recognize.mock.calls[0]?.[1]?.aborted).toBe(true);
      expect(c.remove).toHaveBeenCalledOnce();
      if (exit === "retry") await c.open();
      finish(match);
      await vi.advanceTimersByTimeAsync(20000);
      c.controller.ready(old);
      expect(c.accept).not.toHaveBeenCalled();
      expect(c.recognize).toHaveBeenCalledOnce();
    },
  );
  it("cleans a capture that completes after cancellation without uploading", async () => {
    const c = setup();
    let captured!: (uri: string) => void;
    c.capture.mockReturnValueOnce(
      new Promise((resolve) => {
        captured = resolve;
      }),
    );
    await c.open();
    await vi.advanceTimersByTimeAsync(1200);
    c.controller.close();
    captured("cache://late.jpg");
    await vi.advanceTimersByTimeAsync(0);
    expect(c.remove).toHaveBeenCalledExactlyOnceWith("cache://late.jpg");
    expect(c.recognize).not.toHaveBeenCalled();
    await c.open();
    c.recognize.mockResolvedValueOnce(match);
    await vi.advanceTimersByTimeAsync(1200);
    expect(c.accept).toHaveBeenCalledOnce();
  });
});
