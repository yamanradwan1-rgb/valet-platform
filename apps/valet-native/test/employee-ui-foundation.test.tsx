import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));

import {
  employeeButtonHeights,
  employeeColors,
  employeeFieldHeights,
  employeeRadius,
  employeeSpacing,
} from "../src/employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeTypography,
} from "../src/employee-ui/employee-typography";
import { EmployeeButton } from "../src/employee-ui/employee-controls";
import {
  EmployeeBadge,
  EmployeeCard,
  EmployeeError,
  EmployeeProgress,
  EmployeeStatus,
} from "../src/employee-ui/employee-feedback";
import {
  CheckInButton,
  CheckInError,
  CheckInStatus,
} from "../src/check-in/native-check-in-primitives";

type Element = ReactElement<Record<string, unknown>>;
// Structural contract only: mocked host components do not prove rendered parity.
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return nodes((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...nodes(node.props.children)];
}
function style(node: Element, pressed = false): Record<string, unknown> {
  const value =
    typeof node.props.style === "function"
      ? node.props.style({ pressed })
      : node.props.style;
  return Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
}

describe("Employee visual tokens (Employee Web authority)", () => {
  it("locks the complete approved core palette", () => {
    expect(employeeColors).toEqual({
      warm: "#FAFAF8",
      white: "#FFFFFF",
      navy: "#07111F",
      navy2: "#0B1626",
      navy3: "#111E30",
      blue: "#176BFF",
      ice: "#EDF4FF",
      neutral: "#6F7C91",
      muted: "#8C98AA",
      border: "#DDE4EC",
      success: "#2F9B78",
      warning: "#D89434",
      danger: "#D95C63",
    });
  });
  it("locks rhythm, radii and visual control heights", () => {
    expect(Object.values(employeeSpacing)).toEqual([4, 6, 8, 12, 16, 20, 24]);
    expect(employeeRadius).toEqual({ primary: 16, form: 12, pill: 999 });
    expect(employeeButtonHeights).toEqual({
      large: 56,
      standard: 44,
      compact: 36,
    });
    expect(employeeFieldHeights).toEqual({
      standard: 48,
      plate: 56,
      phone: 56,
    });
  });
  it("maps UI and identity roles to the approved embedded font families", () => {
    expect(employeeTypography.body).toMatchObject({
      fontFamily: employeeFontFamilies.ui,
      fontSize: 14,
      fontWeight: "400",
      lineHeight: 20,
    });
    expect(employeeTypography.small).toMatchObject({
      fontFamily: employeeFontFamilies.ui,
      fontSize: 12,
      fontWeight: "400",
      lineHeight: 16,
    });
    expect(employeeTypography.header).toMatchObject({
      fontFamily: employeeFontFamilies.ui,
      fontSize: 17,
      fontWeight: "600",
    });
    expect(employeeTypography.vehicle).toMatchObject({
      fontFamily: employeeFontFamilies.display,
      fontSize: 26,
      fontWeight: "700",
    });
    expect(employeeTypography.plate).toMatchObject({
      fontFamily: employeeFontFamilies.display,
      fontSize: 36,
      fontWeight: "700",
    });
  });
});

describe("Employee button contract", () => {
  it.each([
    ["primary", 56, "#176BFF", "#FFFFFF", "#0F5EEA"],
    ["danger", 56, "#D95C63", "#FFFFFF", "#8D1C1C"],
    ["secondary", 44, "#FFFFFF", "#07111F", "#F9FAFB"],
    ["ghost", 36, "transparent", "#176BFF", "#EDF4FF"],
  ] as const)(
    "preserves %s hierarchy and press feedback",
    (variant, height, background, color, pressed) => {
      const tree = nodes(
        <EmployeeButton label="Continue" variant={variant} onPress={vi.fn()} />,
      );
      const button = tree.find((node) => node.type === "Pressable")!;
      expect(style(button)).toMatchObject({
        minHeight: height,
        borderRadius: 16,
        backgroundColor: background,
      });
      expect(style(button, true).backgroundColor).toBe(pressed);
      expect(style(tree.find((node) => node.type === "Text")!).color).toBe(
        color,
      );
      expect(style(tree[0]!).minHeight).toBe(48);
      expect(height + 2 * Number(button.props.hitSlop)).toBeGreaterThanOrEqual(
        48,
      );
      if (variant === "secondary")
        expect(style(button)).toMatchObject({
          borderWidth: 1,
          borderColor: "#DDE4EC",
        });
    },
  );
  it.each(["large", "standard", "compact"] as const)(
    "allows explicit %s sizing independent of variant",
    (size) => {
      const button = nodes(
        <EmployeeButton
          label="Edit"
          variant="ghost"
          size={size}
          onPress={vi.fn()}
        />,
      ).find((node) => node.type === "Pressable")!;
      expect(style(button).minHeight).toBe(employeeButtonHeights[size]);
    },
  );
  it.each([true, false])(
    "preserves role, callback and authoritative disabled=%s",
    (disabled) => {
      const onPress = vi.fn();
      const button = nodes(
        <EmployeeButton
          label="Plate"
          role="tab"
          disabled={disabled}
          accessibilityState={{
            selected: true,
            busy: true,
            disabled: !disabled,
          }}
          onPress={onPress}
        />,
      ).find((node) => node.type === "Pressable")!;
      expect(button.props).toMatchObject({
        accessibilityLabel: "Plate",
        accessibilityRole: "tab",
        disabled,
        accessibilityState: { selected: true, busy: true, disabled },
      });
      (button.props.onPress as () => void)();
      expect(onPress).toHaveBeenCalledTimes(disabled ? 0 : 1);
      if (disabled)
        expect(style(button, true)).toMatchObject({
          opacity: 0.4,
          backgroundColor: "#176BFF",
        });
    },
  );
  it("keeps the existing Check-In adapter API and selected tab state", () => {
    const onPress = vi.fn();
    const button = nodes(
      <CheckInButton
        label="No plate"
        secondary
        selected
        role="tab"
        onPress={onPress}
      />,
    ).find((node) => node.type === "Pressable")!;
    expect(button.props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(button.props.accessibilityRole).toBe("tab");
    expect(style(button).backgroundColor).toBe("#FFFFFF");
    expect(style(button).minHeight).toBe(56);
    (button.props.onPress as () => void)();
    expect(onPress).toHaveBeenCalledOnce();
  });
});

describe("Employee feedback foundation", () => {
  it.each([
    ["neutral", "#F5F6F8", "#6F7C91"],
    ["primary", "#EDF4FF", "#176BFF"],
    ["success", "#EEFBF5", "#2F9B78"],
    ["warning", "#FFF4E0", "#D89434"],
    ["danger", "#FFF0F0", "#D95C63"],
  ] as const)(
    "supports %s status labels without deriving domain state",
    (variant, backgroundColor, color) => {
      const badge = nodes(
        <EmployeeBadge label="حالة" textAlign="right" variant={variant} />,
      )[0]!;
      expect(style(badge)).toMatchObject({
        backgroundColor,
        color,
        fontSize: 10,
        fontWeight: "700",
        paddingVertical: 4,
        writingDirection: "rtl",
      });
      expect(badge.props.children).toBe("حالة");
    },
  );
  it("provides the white bordered card surface without domain composition", () => {
    const card = nodes(
      <EmployeeCard accessibilityLabel="Vehicle">Identity</EmployeeCard>,
    )[0]!;
    expect(style(card)).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#DDE4EC",
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
    });
    expect(card.props.accessibilityLabel).toBe("Vehicle");
    expect(card.props.children).toBe("Identity");
  });
  it("retains assertive errors and polite status, including Check-In aliases", () => {
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
    expect(style(status)).not.toHaveProperty("borderRadius");
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
    expect(tree[0]!.props).not.toHaveProperty("accessibilityValue");
  });
});
