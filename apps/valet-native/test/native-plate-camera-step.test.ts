import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cameraStyle,
  currentCameraController,
  plateCameraFixture,
  reenterPlateCamera,
} from "./native-plate-camera-step-test-fixture";

afterEach(() => vi.useRealTimers());

describe("Native assistive plate camera presentation", () => {
  it("auto-opens once on focus while retaining manual and no-plate actions", async () => {
    const { open, render } = plateCameraFixture();
    await Promise.resolve();
    expect(open).toHaveBeenCalledOnce();
    expect(currentCameraController().current().phase).toBe("starting");
    expect(
      render()
        .filter((node) => node.props.label)
        .map((node) => node.props.label),
    ).toContain("Enter manually");
    expect(
      render().some(
        (node) => node.props.label === "No plate / unreadable plate",
      ),
    ).toBe(true);
  });
  it("does not auto-reopen after close, but re-entry opens again", async () => {
    const context = plateCameraFixture();
    await Promise.resolve();
    context.controller.close();
    context.render();
    expect(context.open).toHaveBeenCalledOnce();
    context.cleanup();
    const reenteredCleanup = reenterPlateCamera();
    await Promise.resolve();
    expect(context.open).toHaveBeenCalledTimes(2);
    reenteredCleanup();
  });
  // DEC-074: ready-triggered OCR is the product contract; normal preview must
  // never insert a required manual Capture action between readiness and OCR.
  it("mounts a muted rear camera and does not require a capture button", async () => {
    const context = plateCameraFixture();
    await context.controller.open();
    const starting = context.render();
    const camera = starting.find((node) => node.type === "CameraView")!;
    const viewport = starting.find(
      (node) => node.type === "View" && cameraStyle(node).height === 260,
    )!;
    expect(cameraStyle(viewport)).toMatchObject({
      backgroundColor: "#0B1626",
      borderRadius: 16,
      height: 260,
      overflow: "hidden",
    });
    expect(
      starting.some((node) => node.props.message === "Starting camera…"),
    ).toBe(true);
    expect(camera.props).toMatchObject({ facing: "back", mute: true });
    expect(camera.props.onBarcodeScanned).toBeUndefined();
    expect(camera.props.ref).toEqual(expect.any(Function));
    (camera.props.onCameraReady as () => void)();
    expect(
      context
        .render()
        .some((node) => node.props.label === "Capture plate image"),
    ).toBe(false);
    expect(
      context.render().some((node) => node.props.label === "Enter manually"),
    ).toBe(true);
    expect(
      context
        .render()
        .some((node) => node.props.label === "No plate / unreadable plate"),
    ).toBe(true);
    context.press("Enter manually");
    expect(context.onManual).toHaveBeenCalledOnce();
    expect(context.render().some((node) => node.type === "CameraView")).toBe(
      false,
    );
  });
  it("keeps requesting permission inside the same camera viewport shell", async () => {
    const context = plateCameraFixture(true, "en", true);
    const opening = context.controller.open();
    expect(context.controller.current().phase).toBe("requesting");
    const requesting = context.render();
    expect(
      requesting.some(
        (node) => node.type === "View" && cameraStyle(node).height === 260,
      ),
    ).toBe(true);
    expect(
      requesting.some(
        (node) => node.props.message === "Requesting camera permission…",
      ),
    ).toBe(true);
    context.resolvePermission({ granted: true, canAskAgain: false });
    await opening;
  });
  it("keeps manual and no-plate fallbacks after OCR is unavailable", async () => {
    vi.useFakeTimers();
    const context = plateCameraFixture(true, "en", false, "left", true);
    await context.controller.open();
    const camera = context.render().find((node) => node.type === "CameraView")!;
    (camera.props.onCameraReady as () => void)();
    await vi.advanceTimersByTimeAsync(1200);
    expect(context.controller.current().phase).toBe("unavailable");
    expect(
      context.render().some((node) => node.props.label === "Enter manually"),
    ).toBe(true);
    expect(
      context
        .render()
        .some((node) => node.props.label === "No plate / unreadable plate"),
    ).toBe(true);
  });
  it.each(["Enter manually", "No plate / unreadable plate", "Close camera"])(
    "%s removes preview before transition",
    async (label) => {
      const context = plateCameraFixture();
      await context.controller.open();
      context.press(label);
      expect(context.controller.current().phase).toBe("idle");
      expect(context.render().some((node) => node.type === "CameraView")).toBe(
        false,
      );
    },
  );
});
