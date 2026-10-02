import { afterEach, describe, expect, it, vi } from "vitest";
import {
  plateCameraFixture,
  cameraStyle,
} from "./native-plate-camera-step-test-fixture";

afterEach(() => vi.useRealTimers());
describe("frozen native plate viewport with a decorative physical guide", () => {
  it.each(["en", "ar"] as const)(
    "preserves shell and controls in %s and displays guide only in preview",
    async (locale) => {
      const c = plateCameraFixture(true, locale);
      await c.controller.open();
      expect(
        c.render().some((node) => node.props.testID === "plate-roi-guide"),
      ).toBe(false);
      const starting = c.render();
      const controls = starting
        .filter((node) => node.props.label)
        .map((node) => node.props.label);
      const viewport = starting.find(
        (node) => cameraStyle(node).height === 260,
      )!;
      expect(cameraStyle(viewport)).toEqual({
        backgroundColor: "#0B1626",
        borderRadius: 16,
        height: 260,
        overflow: "hidden",
      });
      const camera = starting.find((node) => node.type === "CameraView")!;
      expect(camera.props).toMatchObject({
        facing: "back",
        mirror: false,
        mute: true,
        accessible: false,
      });
      (camera.props.onCameraReady as () => void)();
      const guide = c
        .render()
        .find((node) => node.props.testID === "plate-roi-guide")!;
      expect(guide.props).toMatchObject({
        pointerEvents: "none",
        accessible: false,
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants",
      });
      expect(cameraStyle(guide)).toMatchObject({
        left: 36,
        top: 85,
        width: 288,
        height: 90,
        direction: "ltr",
        borderWidth: 2,
        backgroundColor: "transparent",
      });
      expect(
        c
          .render()
          .filter((node) => node.props.label)
          .map((node) => node.props.label),
      ).toEqual(controls);
      c.controller.close();
      expect(
        c.render().some((node) => node.props.testID === "plate-roi-guide"),
      ).toBe(false);
      c.cleanup();
    },
  );
  it.each(["denied", "error", "unavailable", "no-match"] as const)(
    "removes the guide in %s without removing permanent fallbacks",
    async (phase) => {
      vi.useFakeTimers();
      const c = plateCameraFixture(
        phase !== "denied",
        "en",
        false,
        "left",
        phase === "no-match" ? "no-match" : phase === "unavailable",
      );
      await c.controller.open();
      if (phase === "error")
        c.controller.fail(c.controller.current().generation);
      if (phase === "unavailable" || phase === "no-match") {
        c.controller.ready(c.controller.current().generation);
        await vi.advanceTimersByTimeAsync(6000);
      }
      expect(c.controller.current().phase).toBe(phase);
      expect(
        c.render().some((node) => node.props.testID === "plate-roi-guide"),
      ).toBe(false);
      const labels = c
        .render()
        .filter((node) => node.props.label)
        .map((node) => node.props.label);
      expect(labels).toContain("Enter manually");
      expect(labels).toContain("No plate / unreadable plate");
      c.cleanup();
    },
  );
});
