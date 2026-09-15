import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cameraStyle,
  plateCameraFixture,
} from "./native-plate-camera-step-test-fixture";

afterEach(() => vi.useRealTimers());

describe("Native assistive plate camera fallback", () => {
  it.each(["denied", "mount-error"])(
    "keeps fallback on %s and reports camera state",
    async (failure) => {
      const context = plateCameraFixture(failure !== "denied");
      await context.controller.open();
      if (failure === "mount-error") {
        const camera = context
          .render()
          .find((node) => node.type === "CameraView")!;
        (camera.props.onMountError as () => void)();
      }
      expect(context.render().some((node) => node.type === "CameraView")).toBe(
        false,
      );
      expect(
        context.render().some((node) => node.props.label === "Enter manually"),
      ).toBe(true);
      expect(
        context
          .render()
          .some((node) => node.props.label === "No plate / unreadable plate"),
      ).toBe(true);
      expect(context.controller.current().phase).toBe(
        failure === "denied" ? "denied" : "error",
      );
      const failed = context.render();
      expect(
        failed.some(
          (node) => node.type === "View" && cameraStyle(node).height === 260,
        ),
      ).toBe(true);
      expect(
        failed.some((node) => typeof node.props.message === "string"),
      ).toBe(true);
      expect(
        context
          .render()
          .some((node) => node.props.label === "Try camera again"),
      ).toBe(true);
      if (failure === "denied") {
        expect(
          context
            .render()
            .some((node) => node.props.label === "Open camera settings"),
        ).toBe(true);
      }
    },
  );

  it("uses localized Arabic entry and cleanup removes preview on focus/unmount exit", async () => {
    const context = plateCameraFixture(true, "ar", false, "left");
    context.controller.close();
    expect(
      context.render().some((node) => node.props.label === "فتح كاميرا اللوحة"),
    ).toBe(true);
    await context.controller.open();
    context.cleanup();
    expect(context.render().some((node) => node.type === "CameraView")).toBe(
      false,
    );
  });
});
