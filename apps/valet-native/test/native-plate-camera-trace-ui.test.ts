import { afterEach, describe, expect, it, vi } from "vitest";

const appearance = vi.hoisted(() => ({ mode: "light" as "light" | "dark" }));
vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeePalettes } =
    await import("../src/appearance/employee-palette");
  return {
    useEmployeePalette: () => employeePalettes[appearance.mode],
    useEmployeeStyles: <T>(styles: { light: T; dark: T }) =>
      styles[appearance.mode],
  };
});
import {
  cameraStyle,
  plateCameraFixture,
} from "./native-plate-camera-step-test-fixture";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("non-visual investigation mode", () => {
  it.each([
    ["en", "light"],
    ["ar", "light"],
    ["en", "dark"],
    ["ar", "dark"],
  ] as const)(
    "preserves rendered hierarchy and props in %s/%s",
    async (locale, mode) => {
      appearance.mode = mode;
      vi.spyOn(console, "info").mockImplementation(() => {});
      vi.stubEnv("EXPO_PUBLIC_PLATE_CAMERA_TRACE", "0");
      const fixture = plateCameraFixture(true, locale);
      await fixture.controller.open();
      const ids = fixture.controller.current();
      for (const phase of ["starting", "preview"] as const) {
        if (phase === "preview") fixture.controller.ready(ids.generation);
        const before = JSON.stringify(fixture.render());
        vi.stubEnv("EXPO_PUBLIC_PLATE_CAMERA_TRACE", "1");
        fixture.controller.trace.record("native-error", { reason: "native" });
        expect(JSON.stringify(fixture.render())).toBe(before);
        expect(
          fixture.render().find((node) => cameraStyle(node).height === 260),
        ).toBeDefined();
        expect(fixture.controller.current().phase).toBe(phase);
        vi.stubEnv("EXPO_PUBLIC_PLATE_CAMERA_TRACE", "0");
      }
      fixture.cleanup();
    },
  );
});
