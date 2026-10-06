import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const menu = vi.hoisted(() => ({ open: false }));

vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: () => [menu.open, (open: boolean) => (menu.open = open)],
}));
vi.mock("react-native", () => ({
  Animated: {},
  Image: "Image",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { absoluteFill: {}, create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("expo-blur", () => ({ BlurView: "BlurView" }));
vi.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));

const {
  NativeActiveHeaderUtilities,
  NativeAccountMenu,
  nativeActiveHeaderStyles,
} = await import("../src/shell/native-active-header-utilities");
const { EmployeeAppHeader, EmployeeFrame, employeeFrameStyles } =
  await import("../src/employee-ui/employee-frame");
const { EmployeeBrandLogo } =
  await import("../src/employee-ui/employee-brand-logo");
const { EmployeeSettingsIcon } =
  await import("../src/employee-ui/employee-icons");
const { nativeAccountMenuCopy } =
  await import("../src/shell/native-account-menu-copy");
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

function style(value: unknown): Record<string, unknown> {
  return Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
}

beforeEach(() => {
  menu.open = false;
});

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

  it.each(["en", "ar"] as const)(
    "keeps the same gear entry and menu in %s",
    (locale) => {
      const onSelectLocale = vi.fn();
      const utility = NativeActiveHeaderUtilities({
        locale,
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
      expect(avatar.props.accessibilityLabel).toBe(
        nativeAccountMenuCopy[locale].title,
      );
      expect(avatar.props.hitSlop).toBe(6);
      expect(
        elements(avatar).filter((node) => node.type === "Pressable"),
      ).toHaveLength(1);
      expect(elements(avatar).some((node) => node.type === "Text")).toBe(false);
      expect(
        elements(avatar).filter((node) => node.type === EmployeeSettingsIcon),
      ).toHaveLength(1);
      expect(
        nodes.some((node) => node.type === NativePushPermissionStatus),
      ).toBe(true);
      expect(JSON.stringify(nodes.map((node) => node.props))).toContain(
        "English",
      );
      expect(JSON.stringify(nodes.map((node) => node.props))).toContain(
        "العربية",
      );
      const pressStyle = avatar.props.style as (state: {
        pressed: boolean;
      }) => unknown;
      expect(style(pressStyle({ pressed: false }))).toEqual({
        alignItems: "center",
        backgroundColor: employeeColors.navy3,
        borderRadius: 999,
        height: 36,
        justifyContent: "center",
        width: 36,
      });
      expect(style(pressStyle({ pressed: true }))).toEqual({
        ...nativeActiveHeaderStyles.avatar,
        opacity: 0.7,
      });
      const modal = nodes.find((node) => node.type === "Modal")!;
      expect(modal.props).toMatchObject({
        animationType: "fade",
        transparent: true,
        visible: false,
      });
      (avatar.props.onPress as () => void)();
      const opened = elements(NativeAccountMenu(utility.props as never));
      expect(opened.find((node) => node.type === "Modal")!.props.visible).toBe(
        true,
      );
      expect(
        style(
          opened.find((node) => node.props.testID === "native-account-menu")!
            .props.style,
        ).direction,
      ).toBe(locale === "ar" ? "rtl" : "ltr");
      const arabicChoice = opened.find(
        (node) => node.props.label === "العربية",
      )!;
      const arabic = (arabicChoice.type as (props: unknown) => Element)(
        arabicChoice.props,
      );
      (arabic.props.onPress as () => void)();
      expect(onSelectLocale).toHaveBeenCalledWith("ar");
      const englishChoice = opened.find(
        (node) => node.props.label === "English",
      )!;
      const english = (englishChoice.type as (props: unknown) => Element)(
        englishChoice.props,
      );
      (english.props.onPress as () => void)();
      expect(onSelectLocale).toHaveBeenCalledWith("en");
      (modal.props.onRequestClose as () => void)();
      expect(menu.open).toBe(false);
      (avatar.props.onPress as () => void)();
      (
        opened.find(
          (node) => node.props.testID === "native-account-menu-backdrop",
        )!.props.onPress as () => void
      )();
      expect(menu.open).toBe(false);
    },
  );

  it("renders a decorative token-colored SVG gear", () => {
    const nodes = elements(
      EmployeeSettingsIcon({ color: employeeColors.white, size: 20 }),
    );
    expect(nodes[0]!.props).toMatchObject({
      accessible: false,
      height: 20,
      width: 20,
      viewBox: "0 0 24 24",
    });
    expect(
      nodes.filter((node) => node.props.stroke === employeeColors.white),
    ).toHaveLength(2);
  });

  it.each(["en", "ar", "en"] as const)(
    "fixes physical header structure while preserving %s text direction",
    (locale) => {
      const textAlign = locale === "ar" ? "right" : "left";
      const location = {
        ...scope,
        locationName: locale === "ar" ? "فندق عمان" : scope.locationName,
      };
      const utility = NativeActiveHeaderUtilities({
        locale,
        scope: location,
        pushSnapshot,
        onRequestNotificationPermission: vi.fn(async () => undefined),
        onSelectLocale: vi.fn(),
      });
      const renderedMenu = NativeAccountMenu(utility.props);
      const header = EmployeeAppHeader({
        scope: location,
        textAlign,
        utilities: renderedMenu,
      });
      const [brand, utilities] = header.props.children as Element[];
      expect(style(header.props.style)).toEqual({
        ...employeeFrameStyles.appHeader,
        direction: "ltr",
        flexDirection: "row",
        height: 64,
        paddingHorizontal: 20,
      });
      expect(style(brand!.props.style)).toMatchObject({
        direction: "ltr",
        flexDirection: "row",
        gap: 12,
      });
      const [logoSlot, divider, context] = brand!.props.children as Element[];
      expect(style(logoSlot!.props.style)).toMatchObject({
        flexShrink: 1,
        height: 28,
        width: (28 * 169) / 60,
      });
      const logo = logoSlot!.props.children as Element;
      expect(logo.type).toBe(EmployeeBrandLogo);
      expect(logo.props).toMatchObject({
        fill: true,
        height: 28,
        surface: "light",
      });
      expect(style(divider!.props.style)).toEqual({
        backgroundColor: employeeColors.border,
        height: 20,
        width: 1,
      });
      const [name, code] = context!.props.children as Element[];
      expect(name!.props.children).toBe(location.locationName);
      expect(style(name!.props.style)).toMatchObject({
        textAlign,
        writingDirection: locale === "ar" ? "rtl" : "ltr",
        fontSize: 13,
        lineHeight: 16,
      });
      expect(style(code!.props.style)).toMatchObject({
        textAlign: "left",
        writingDirection: "ltr",
        fontSize: 11,
        lineHeight: 14,
      });
      expect(name!.props.numberOfLines).toBe(1);
      expect(code!.props.numberOfLines).toBe(1);
      expect(style(utilities!.props.style)).toMatchObject({
        direction: "ltr",
        flexDirection: "row",
        gap: 8,
      });
      expect(
        elements(utilities).some((node) => node.type === EmployeeSettingsIcon),
      ).toBe(true);
      const frame = elements(
        EmployeeFrame({
          direction: locale === "ar" ? "rtl" : "ltr",
          children: header,
        }),
      );
      expect(
        style(
          frame.find((node) => node.props.testID === "employee-frame")!.props
            .style,
        ).direction,
      ).toBe(locale === "ar" ? "rtl" : "ltr");
    },
  );
});
