import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Text: "Text",
  View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));

import {
  EmployeeBadge,
  EmployeeCard,
  EmployeeError,
  EmployeeProgress,
  EmployeeStatus,
} from "../src/employee-ui/employee-feedback";
import {
  CheckInError,
  CheckInStatus,
} from "../src/check-in/native-check-in-primitives";

type Element = ReactElement<Record<string, unknown>>;

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function") {
    return nodes((node.type as (props: unknown) => unknown)(node.props));
  }
  return [node, ...nodes(node.props.children)];
}

function style(node: Element): Record<string, unknown> {
  return Object.assign(
    {},
    ...[node.props.style].flat(Infinity).filter(Boolean),
  );
}

describe("Employee card geometry", () => {
  it.each([
    ["compact", 16],
    ["standard", 20],
    ["spacious", 24],
  ] as const)("supports %s Web padding", (padding, value) => {
    const card = nodes(
      <EmployeeCard contentGap="md" padding={padding}>
        Identity
      </EmployeeCard>,
    )[0]!;
    expect(style(card)).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#DDE4EC",
      borderRadius: 16,
      borderWidth: 1,
      gap: 12,
      padding: value,
    });
  });

  it("retains the 16px/6px compatibility defaults and permits no gap", () => {
    const defaultCard = nodes(
      <EmployeeCard accessibilityLabel="Vehicle">Identity</EmployeeCard>,
    )[0]!;
    expect(style(defaultCard)).toMatchObject({ padding: 16, gap: 6 });
    expect(defaultCard.props).toMatchObject({
      accessible: true,
      accessibilityLabel: "Vehicle",
    });
    const noGap = nodes(
      <EmployeeCard contentGap="none">Identity</EmployeeCard>,
    )[0]!;
    expect(style(noGap).gap).toBe(0);
  });
});

describe("Employee badge presentation", () => {
  it.each([
    ["neutral", "#F5F6F8", "#6F7C91"],
    ["primary", "#EDF4FF", "#176BFF"],
    ["success", "#EEFBF5", "#2F9B78"],
    ["successSoft", "#F0FFF8", "#2F9B78"],
    ["warning", "#FFF4E0", "#D89434"],
    ["danger", "#FFF0F0", "#D95C63"],
  ] as const)(
    "supports the %s pill, optional dot and localized label",
    (variant, backgroundColor, color) => {
      const tree = nodes(
        <EmployeeBadge
          label="حالة"
          showDot
          textAlign="right"
          variant={variant}
        />,
      );
      expect(tree[0]!.props).toMatchObject({
        accessible: true,
        accessibilityLabel: "حالة",
      });
      expect(style(tree[0]!)).toMatchObject({
        backgroundColor,
        borderRadius: 999,
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
      });
      const dot = tree.find((node) => style(node).width === 6)!;
      expect(style(dot)).toMatchObject({
        backgroundColor: color,
        borderRadius: 999,
        height: 6,
      });
      const label = tree.find((node) => node.props.children === "حالة")!;
      expect(style(label)).toMatchObject({
        color,
        fontSize: 10,
        fontWeight: "700",
        letterSpacing: 0.5,
        writingDirection: "rtl",
      });
    },
  );

  it("retains the no-dot compatibility default", () => {
    const tree = nodes(
      <EmployeeBadge label="QUEUED" textAlign="left" variant="neutral" />,
    );
    expect(tree.some((node) => style(node).width === 6)).toBe(false);
    expect(tree.find((node) => node.props.children === "QUEUED")).toBeDefined();
  });
});

describe("Employee feedback accessibility", () => {
  it("retains assertive errors and polite status, including aliases", () => {
    expect(CheckInError).toBe(EmployeeError);
    expect(CheckInStatus).toBe(EmployeeStatus);
    const error = nodes(<CheckInError textAlign="right">خطأ</CheckInError>)[0]!;
    expect(error.props.accessibilityLiveRegion).toBe("assertive");
    expect(style(error)).toMatchObject({
      color: "#D95C63",
      borderRadius: 12,
      fontSize: 12,
      lineHeight: 16,
      writingDirection: "rtl",
    });
    const status = nodes(
      <CheckInStatus textAlign="left">Checking</CheckInStatus>,
    )[0]!;
    expect(status.props.accessibilityLiveRegion).toBe("polite");
    expect(style(status)).toMatchObject({
      fontSize: 14,
      lineHeight: 20,
      writingDirection: "ltr",
    });
  });

  it("exposes an indeterminate native progress state with localized copy", () => {
    const tree = nodes(
      <EmployeeProgress label="جارٍ التحقق" textAlign="right" />,
    );
    expect(tree[0]!.props).toMatchObject({
      accessible: true,
      accessibilityRole: "progressbar",
      accessibilityLabel: "جارٍ التحقق",
      accessibilityState: { busy: true },
      accessibilityLiveRegion: "polite",
    });
    expect(
      tree.find((node) => node.type === "ActivityIndicator")!.props,
    ).toMatchObject({ accessible: false, color: "#176BFF" });
  });
});
