import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  View: "View",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
vi.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));

const { GateGradientSvg, employeeGateFarthestCornerEllipse } =
  await import("../src/shell/native-gate-shell");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

describe("Employee gate CSS radial-gradient mapping", () => {
  it.each([
    [360, 800],
    [412, 915],
    [800, 360],
  ])("derives farthest-corner ellipse radii for %sx%s", (width, height) => {
    expect(employeeGateFarthestCornerEllipse(width, height)).toEqual({
      centerX: width * 0.55,
      centerY: 0,
      radiusX: width * 0.55 * Math.SQRT2,
      radiusY: height * Math.SQRT2,
    });
  });

  it("keeps 65% as the navy color stop, independent of ellipse radii", () => {
    const width = 360;
    const height = 800;
    const nodes = elements(GateGradientSvg({ height, width }));
    const gradient = nodes.find((node) => node.type === "RadialGradient")!;
    const stops = nodes.filter((node) => node.type === "Stop");
    const ellipse = employeeGateFarthestCornerEllipse(width, height);

    expect(gradient.props).toMatchObject({
      cx: width * 0.55,
      cy: 0,
      fx: width * 0.55,
      fy: 0,
      gradientUnits: "userSpaceOnUse",
      rx: ellipse.radiusX,
      ry: ellipse.radiusY,
    });
    expect(stops.map((node) => node.props)).toEqual([
      { offset: "0%", stopColor: "#0B2D6E" },
      { offset: "65%", stopColor: "#07111F" },
      { offset: "100%", stopColor: "#07111F" },
    ]);
    expect(gradient.props.rx).not.toBe("65%");
    expect(gradient.props.ry).not.toBe("65%");
  });
});
