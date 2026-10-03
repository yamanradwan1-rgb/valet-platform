import { describe, expect, it } from "vitest";
import {
  plateCameraFixture,
  cameraStyle,
  type CameraElement,
} from "./native-plate-camera-step-test-fixture";

function torchStyle(node: CameraElement) {
  return Object.assign(
    {},
    ...(node.props.style as (state: { pressed: boolean }) => object[])({
      pressed: false,
    }),
  );
}

describe("Frozen plate scanner with torch overlay", () => {
  it.each([
    ["en", "Flashlight", "On", "Off"],
    ["ar", "المصباح", "تشغيل", "إيقاف"],
  ] as const)(
    "exposes requested switch state and localized visible copy in %s",
    async (locale, label, on, off) => {
      const context = plateCameraFixture(true, locale);
      await context.controller.open();
      expect(
        context.render().some((n) => n.props.testID === "plate-torch"),
      ).toBe(false);
      context.controller.ready(context.controller.current().generation);
      const before = context.render();
      const controls = before
        .filter((n) => n.props.label)
        .map((n) => n.props.label);
      const torch = before.find((n) => n.props.testID === "plate-torch")!;
      expect(torch.props).toMatchObject({
        accessibilityRole: "switch",
        accessibilityLabel: label,
        accessibilityState: { checked: false },
      });
      expect(before.some((n) => n.props.children === off)).toBe(true);
      const style = torchStyle(torch);
      expect(style).toMatchObject({
        height: 48,
        minWidth: 48,
        position: "absolute",
        top: 8,
        right: 8,
      });
      const guide = before.find((n) => n.props.testID === "plate-roi-guide")!;
      expect(Number(style.top) + Number(style.height)).toBeLessThan(
        Number(cameraStyle(guide).top),
      );
      expect(cameraStyle(guide)).toMatchObject({
        width: 288,
        height: 90,
        direction: "ltr",
      });
      expect(before.some((n) => cameraStyle(n).height === 260)).toBe(true);
      (torch.props.onPress as () => void)();
      const enabled = context.render();
      expect(
        enabled.find((n) => n.type === "CameraView")!.props.enableTorch,
      ).toBe(true);
      expect(
        enabled.find((n) => n.props.testID === "plate-torch")!.props
          .accessibilityState,
      ).toEqual({ checked: true });
      expect(enabled.some((n) => n.props.children === on)).toBe(true);
      expect(
        enabled.filter((n) => n.props.label).map((n) => n.props.label),
      ).toEqual(controls);
      (
        enabled.find((n) => n.props.testID === "plate-torch")!.props
          .onPress as () => void
      )();
      expect(
        context.render().find((n) => n.type === "CameraView")!.props
          .enableTorch,
      ).toBe(false);
      context.cleanup();
      (torch.props.onPress as () => void)();
      expect(context.controller.current().torchEnabled).toBe(false);
    },
  );

  it.each(["denied", "error"])(
    "%s preserves manual/no-plate and hides the torch",
    async (phase) => {
      const context = plateCameraFixture(phase !== "denied");
      await context.controller.open();
      if (phase === "error")
        context.controller.fail(context.controller.current().generation);
      expect(
        context.render().some((n) => n.props.testID === "plate-torch"),
      ).toBe(false);
      expect(
        context
          .render()
          .filter((n) => n.props.label)
          .map((n) => n.props.label),
      ).toEqual(
        expect.arrayContaining([
          "Enter manually",
          "No plate / unreadable plate",
        ]),
      );
      context.press("Enter manually");
      expect(context.onManual).toHaveBeenCalledOnce();
      context.cleanup();
    },
  );
});
