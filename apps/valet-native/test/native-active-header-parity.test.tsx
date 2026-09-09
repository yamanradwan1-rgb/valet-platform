import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Animated: {},
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("expo-blur", () => ({ BlurView: "BlurView" }));

const {
  NativeActiveHeaderUtilities,
  nativeActiveHeaderStyles,
  nativeRoleInitials,
} = await import("../src/shell/native-active-header-utilities");
const { NativeGateLocaleToggle } =
  await import("../src/shell/native-gate-primitives");
const { employeeColors } = await import("../src/employee-ui/employee-tokens");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

describe("Native active Employee header utilities", () => {
  it("reuses the exact EN / عربي locale control and renders the VE avatar", () => {
    const onSelectLocale = vi.fn();
    const nodes = elements(
      NativeActiveHeaderUtilities({
        locale: "en",
        onSelectLocale,
        role: "VALET_EMPLOYEE",
      }),
    );
    const toggle = nodes.find((node) => node.type === NativeGateLocaleToggle)!;
    const avatar = nodes.find(
      (node) => node.props.testID === "native-role-avatar",
    )!;

    expect(toggle.props).toMatchObject({ locale: "en", onSelectLocale });
    expect(avatar.props.accessibilityLabel).toBe("VE");
    expect(nodes.some((node) => node.props.children === "VE")).toBe(true);
    expect(nativeActiveHeaderStyles.avatar).toMatchObject({
      backgroundColor: employeeColors.navy3,
      borderRadius: 999,
      height: 36,
      width: 36,
    });
    expect(nativeActiveHeaderStyles.avatarLabel).toMatchObject({
      color: employeeColors.white,
      fontFamily: "Space Grotesk",
      fontSize: 11,
      fontWeight: "700",
    });
  });

  it("maps only authoritative Employee roles to Web initials", () => {
    expect(nativeRoleInitials("VALET_EMPLOYEE")).toBe("VE");
    expect(nativeRoleInitials("VALET_SUPERVISOR")).toBe("VS");
    expect(nativeRoleInitials("UNKNOWN")).toBeNull();
  });
});
