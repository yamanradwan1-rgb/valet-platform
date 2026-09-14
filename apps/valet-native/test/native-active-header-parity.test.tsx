import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("react-native", () => ({
  Animated: {},
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { absoluteFill: {}, create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("expo-blur", () => ({ BlurView: "BlurView" }));

const {
  NativeActiveHeaderUtilities,
  NativeAccountMenu,
  nativeActiveHeaderStyles,
  nativeEmployeeInitials,
  nativeRoleInitials,
} = await import("../src/shell/native-active-header-utilities");
const { NativePushPermissionStatus } =
  await import("../src/notifications/native-push-permission-status");
const { employeeColors } = await import("../src/employee-ui/employee-tokens");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

describe("Native active Employee header utilities", () => {
  const scope = {
    locationCode: "AMM-DEMO",
    locationId: "location",
    locationName: "Amman",
    membershipId: "membership",
    organizationId: "organization",
    organizationName: "VAYLET Demo",
    role: "VALET_EMPLOYEE" as const,
    shiftId: "shift",
    shiftStartedAt: "2026-09-14T12:00:00.000Z",
  };
  const pushSnapshot = {
    attentionIntentIds: [],
    channelAvailable: true,
    permission: "granted" as const,
    registration: "confirmed" as const,
  };

  it("keeps one VE account entry point and removes the inline locale toggle", () => {
    const onSelectLocale = vi.fn();
    const utility = NativeActiveHeaderUtilities({
      locale: "en",
      onRequestNotificationPermission: vi.fn(async () => undefined),
      onSelectLocale,
      pushSnapshot,
      scope,
    }) as ReactElement<Record<string, unknown>>;
    expect(utility.type).toBe(NativeAccountMenu);
    const nodes = elements(NativeAccountMenu(utility.props as never));
    const avatar = nodes.find(
      (node) => node.props.testID === "native-role-avatar",
    )!;

    expect(avatar.props.accessibilityRole).toBe("button");
    expect(avatar.props.accessibilityLabel).toBe("Account and settings");
    expect(nodes.some((node) => node.props.children === "VE")).toBe(true);
    expect(nodes.some((node) => node.type === NativePushPermissionStatus)).toBe(
      true,
    );
    expect(JSON.stringify(nodes.map((node) => node.props))).toContain(
      "English",
    );
    expect(JSON.stringify(nodes.map((node) => node.props))).toContain(
      "العربية",
    );
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
    expect(nativeEmployeeInitials("Ahmed Saleh", "VALET_EMPLOYEE")).toBe("AS");
    expect(nativeEmployeeInitials(undefined, "VALET_EMPLOYEE")).toBe("VE");
  });
});
