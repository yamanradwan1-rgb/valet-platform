import { describe, expect, it, vi } from "vitest";
import { NativePlateCameraController } from "../src/check-in/native-plate-camera-controller";

async function preview(granted = true) {
  const controller = new NativePlateCameraController({
    get: async () => ({ granted, canAskAgain: false }),
    request: async () => ({ granted, canAskAgain: false }),
  });
  controller.setEligible(true);
  await controller.open();
  controller.ready(controller.current().generation);
  return controller;
}

function toggle(controller: NativePlateCameraController) {
  const { generation, mountId } = controller.current();
  controller.toggleTorch(generation, mountId);
}

describe("Plate camera requested torch state", () => {
  it("defaults OFF, toggles ON/OFF without changing preview or OCR authority", async () => {
    const controller = await preview();
    const snapshot = controller.current();
    expect(snapshot.torchEnabled).toBe(false);
    toggle(controller);
    expect(controller.current()).toEqual({ ...snapshot, torchEnabled: true });
    toggle(controller);
    expect(controller.current()).toEqual(snapshot);
  });

  it.each(["close", "retire", "error", "geometry"])(
    "%s resets OFF and rejects stale controls/readiness",
    async (exit) => {
      const controller = await preview();
      toggle(controller);
      const { generation, mountId } = controller.current();
      if (exit === "close") controller.close();
      if (exit === "retire") controller.setEligible(false);
      if (exit === "error") controller.fail(generation);
      if (exit === "geometry") controller.geometryUnavailable(generation);
      controller.toggleTorch(generation, mountId);
      controller.ready(generation);
      expect(controller.current().torchEnabled).toBe(false);
      controller.setEligible(true);
      await controller.open();
      controller.ready(controller.current().generation);
      expect(controller.current().torchEnabled).toBe(false);
    },
  );

  it("permission denial cannot request torch", async () => {
    const controller = await preview(false);
    toggle(controller);
    expect(controller.current()).toMatchObject({
      phase: "denied",
      torchEnabled: false,
    });
  });

  it("preserves a requested torch only across a same-generation capture fallback", async () => {
    const controller = await preview();
    controller.close();
    await controller.open();
    const generation = controller.current().generation;
    controller.configurePictureSizes(generation, "1920x1080", "1024x576");
    controller.ready(generation);
    toggle(controller);
    const mountId = controller.current().mountId;
    const waiting = controller.waitForCaptureFallback(
      generation,
      new AbortController().signal,
    );
    expect(controller.current()).toMatchObject({
      phase: "starting",
      torchEnabled: true,
    });
    controller.toggleTorch(generation, mountId);
    controller.ready(generation);
    expect(await waiting).toBe(true);
    expect(controller.current().torchEnabled).toBe(true);
    controller.toggleTorch(generation, mountId);
    expect(controller.current().torchEnabled).toBe(true);
    toggle(controller);
    expect(controller.current().torchEnabled).toBe(false);
  });

  it("torch ignored by unsupported hardware leaves the one OCR attempt usable", async () => {
    vi.useFakeTimers();
    const accept = vi.fn();
    const recognize = vi.fn(async () => ({
      status: "MATCH" as const,
      candidate: { plateNumberRaw: "12-34567", confidence: 1 },
    }));
    const controller = new NativePlateCameraController(
      {
        get: async () => ({ granted: true, canAskAgain: false }),
        request: async () => ({ granted: true, canAskAgain: false }),
      },
      {
        capture: async () => "temporary.jpg",
        recognize,
        remove: async () => {},
        accept,
      },
    );
    controller.setEligible(true);
    await controller.open();
    controller.ready(controller.current().generation);
    toggle(controller); // Native no-flash hardware may ignore the property.
    await vi.advanceTimersByTimeAsync(1200);
    expect(recognize).toHaveBeenCalledOnce();
    expect(accept).toHaveBeenCalledExactlyOnceWith("12-34567");
    expect(controller.current()).toMatchObject({
      phase: "idle",
      torchEnabled: false,
    });
    vi.useRealTimers();
  });
});
