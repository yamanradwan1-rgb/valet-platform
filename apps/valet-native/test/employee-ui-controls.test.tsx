import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  Text: "Text",
  View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));

import { EmployeeButton } from "../src/employee-ui/employee-controls";
import { CheckInButton } from "../src/check-in/native-check-in-primitives";

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

function style(node: Element, pressed = false): Record<string, unknown> {
  const value =
    typeof node.props.style === "function"
      ? node.props.style({ pressed })
      : node.props.style;
  return Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
}

describe("Employee button Web geometry and variants", () => {
  it.each([
    ["primary", 56, "#176BFF", "#FFFFFF", "#0F5EEA", undefined],
    ["secondary", 44, "#FFFFFF", "#07111F", "#F9FAFB", undefined],
    ["ghost", 36, "transparent", "#176BFF", "#EDF4FF", undefined],
    ["danger", 56, "#D95C63", "#FFFFFF", "#D95C63", 0.9],
    ["success", 56, "#2F9B78", "#FFFFFF", "#2F9B78", 0.9],
  ] as const)(
    "preserves %s hierarchy and press feedback",
    (variant, height, background, color, pressed, opacity) => {
      const tree = nodes(
        <EmployeeButton label="Continue" variant={variant} onPress={vi.fn()} />,
      );
      const button = tree.find((node) => node.type === "Pressable")!;
      expect(tree[0]).toBe(button);
      expect(style(button)).toMatchObject({
        height,
        borderRadius: 16,
        backgroundColor: background,
      });
      expect(style(button)).not.toHaveProperty("minHeight");
      expect(style(button, true)).toMatchObject({
        backgroundColor: pressed,
        transform: [{ scale: 0.98 }],
      });
      expect(style(button, true).opacity).toBe(opacity);
      expect(style(tree.find((node) => node.type === "Text")!).color).toBe(
        color,
      );
      if (variant === "secondary") {
        expect(style(button)).toMatchObject({
          borderWidth: 1,
          borderColor: "#DDE4EC",
        });
      }
    },
  );

  it.each([
    ["large", 56, 0],
    ["standard", 44, 2],
    ["compact", 36, 6],
  ] as const)(
    "uses an exact %s layout height and non-layout touch extension",
    (size, height, extension) => {
      const button = nodes(
        <EmployeeButton label="Edit" size={size} onPress={vi.fn()} />,
      ).find((node) => node.type === "Pressable")!;
      expect(style(button).height).toBe(height);
      expect(button.props.hitSlop).toEqual({
        bottom: extension,
        left: 0,
        right: 0,
        top: extension,
      });
    },
  );

  it("preserves disabled callback and accessibility state", () => {
    const onPress = vi.fn();
    const button = nodes(
      <EmployeeButton
        accessibilityState={{ selected: true }}
        disabled
        label="Plate"
        onPress={onPress}
        role="tab"
      />,
    ).find((node) => node.type === "Pressable")!;
    expect(button.props).toMatchObject({
      accessibilityLabel: "Plate",
      accessibilityRole: "tab",
      accessibilityState: { selected: true, disabled: true },
      disabled: true,
    });
    (button.props.onPress as () => void)();
    expect(onPress).not.toHaveBeenCalled();
    expect(style(button, true)).toMatchObject({
      backgroundColor: "#176BFF",
      opacity: 0.4,
    });
  });

  it("keeps the Check-In adapter API and selected tab state", () => {
    const button = nodes(
      <CheckInButton
        label="No plate"
        onPress={vi.fn()}
        role="tab"
        secondary
        selected
      />,
    ).find((node) => node.type === "Pressable")!;
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(style(button)).toMatchObject({
      backgroundColor: "#FFFFFF",
      height: 56,
    });
  });
});
