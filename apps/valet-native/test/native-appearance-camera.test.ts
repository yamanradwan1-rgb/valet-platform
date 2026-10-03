import { describe, expect, it, vi } from "vitest";
import { employeePalettes } from "../src/appearance/employee-palette";

const selection = vi.hoisted(() => ({ mode: "light" as "light" | "dark" }));
vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeePalettes: palettes } =
    await import("../src/appearance/employee-palette");
  return {
    useEmployeePalette: () => palettes[selection.mode],
    useEmployeeStyles: <T>(styles: { light: T; dark: T }) =>
      styles[selection.mode],
  };
});
import { plateCameraFixture } from "./native-plate-camera-step-test-fixture";

describe("themed live Plate camera and #226 torch", () => {
  it.each(["en", "ar"] as const)(
    "switches presentation without reopening the %s camera",
    async (locale) => {
      selection.mode = "light";
      const fixture = plateCameraFixture(true, locale);
      await fixture.controller.open();
      const initial = fixture.controller.current();
      fixture.controller.ready(initial.generation);
      const light = fixture.render();
      const off = light.find((n) => n.props.testID === "plate-torch")!;
      expect(off.props.accessibilityState).toEqual({ checked: false });
      selection.mode = "dark";
      const dark = fixture.render();
      expect(fixture.controller.current().generation).toBe(initial.generation);
      expect(fixture.controller.current().mountId).toBe(initial.mountId);
      const torch = dark.find((n) => n.props.testID === "plate-torch")!;
      (torch.props.onPress as () => void)();
      const on = fixture.render();
      expect(on.find((n) => n.type === "CameraView")!.props.enableTorch).toBe(
        true,
      );
      expect(
        on.find((n) => n.props.testID === "plate-torch")!.props
          .accessibilityState,
      ).toEqual({ checked: true });
      const style = Object.assign(
        {},
        ...(torch.props.style as (s: unknown) => unknown[])({ pressed: false }),
      );
      expect(style).toMatchObject({
        height: 48,
        minWidth: 48,
        backgroundColor: employeePalettes.dark.surface,
      });
      const enabledStyle = Object.assign(
        {},
        ...(
          on.find((n) => n.props.testID === "plate-torch")!.props.style as (
            s: unknown,
          ) => unknown[]
        )({ pressed: false }),
      );
      expect(enabledStyle.backgroundColor).toBe(
        employeePalettes.dark.actionPrimary,
      );
      selection.mode = "light";
      expect(
        fixture.render().find((n) => n.type === "CameraView")!.props
          .enableTorch,
      ).toBe(true);
      fixture.cleanup();
      expect(fixture.controller.current().torchEnabled).toBe(false);
    },
  );
});
