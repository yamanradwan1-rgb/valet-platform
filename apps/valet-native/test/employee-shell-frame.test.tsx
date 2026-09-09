import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { EmployeeOperationalScope } from "@valet/employee-client";

vi.mock("react-native", () => ({
  Image: "Image",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
vi.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));

const { EmployeeAppHeader, EmployeeFrame, employeeFrameStyles } =
  await import("../src/employee-ui/employee-frame");
const { EmployeeBackHeader } =
  await import("../src/employee-ui/employee-back-header");
const { EmployeeBackIcon } = await import("../src/employee-ui/employee-icons");
const { employeeColors, employeeSpacing } =
  await import("../src/employee-ui/employee-tokens");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

function style(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return Object.assign({}, ...value.filter(Boolean).map(style));
  }
  return (value ?? {}) as Record<string, unknown>;
}

const scope: EmployeeOperationalScope = {
  locationCode: "AMMAN",
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "VAYLET",
  role: "VALET_EMPLOYEE",
  shiftId: "44444444-4444-4444-8444-444444444444",
  shiftStartedAt: "2026-09-04T08:00:00.000Z",
};

describe("Employee production frame", () => {
  it("uses navy outer gutters around the warm constrained Employee frame", () => {
    const nodes = elements(
      EmployeeFrame({ children: "content", direction: "rtl" }),
    );
    const safeArea = nodes.find((node) => node.type === "SafeAreaView")!;
    const statusBar = nodes.find((node) => node.type === "StatusBar")!;
    const frame = nodes.find((node) => node.props.testID === "employee-frame")!;

    expect(style(safeArea.props.style).backgroundColor).toBe(
      employeeColors.navy3,
    );
    expect(statusBar.props.style).toBe("light");
    expect(style(frame.props.style)).toMatchObject({
      backgroundColor: employeeColors.warm,
      direction: "rtl",
      maxWidth: 390,
      width: "100%",
    });
    expect(style(frame.props.style)).not.toHaveProperty("borderRadius");
    expect(style(frame.props.style)).not.toHaveProperty("shadowColor");
    expect(employeeSpacing.screen).toBe(20);
  });

  it("uses the approved logo asset and authoritative operational context", () => {
    const nodes = elements(
      EmployeeAppHeader({ scope, textAlign: "left", utilities: "utilities" }),
    );
    const header = nodes.find(
      (node) => node.props.testID === "employee-app-header",
    )!;
    const logo = nodes.find((node) => node.type === "Image")!;

    expect(style(header.props.style)).toMatchObject({
      backgroundColor: employeeColors.white,
      borderBottomColor: employeeColors.border,
      borderBottomWidth: 1,
      height: 64,
      paddingHorizontal: 20,
    });
    expect(employeeFrameStyles.appHeader).not.toHaveProperty("minHeight");
    expect(employeeFrameStyles.brandContext.minWidth).toBe(0);
    expect(employeeFrameStyles.brandLogo.flexShrink).toBe(1);
    expect(employeeFrameStyles.brandLogo).toMatchObject({
      aspectRatio: 169 / 60,
      height: 28,
    });
    expect(employeeFrameStyles.divider).toMatchObject({ height: 20, width: 1 });
    expect(employeeFrameStyles.locationName).toMatchObject({
      fontSize: 13,
      fontWeight: "600",
    });
    expect(employeeFrameStyles.locationCode).toMatchObject({
      fontSize: 11,
      fontWeight: "400",
    });
    expect(employeeFrameStyles.headerUtilities.gap).toBe(8);
    expect(employeeFrameStyles.context.minWidth).toBe(0);
    expect(logo.props.accessibilityLabel).toBe("VAYLET");
    expect(logo.props.source).toBeTruthy();
    expect(style(logo.props.style).transform).toBeUndefined();
    expect(nodes.some((node) => node.props.children === "Amman Hotel")).toBe(
      true,
    );
    expect(nodes.some((node) => node.props.children === "AMMAN")).toBe(true);

    const digest = (path: string) =>
      createHash("sha256").update(readFileSync(path)).digest("hex");
    expect(
      digest(
        resolve(
          import.meta.dirname,
          "../assets/brand/VAYLET_Logo_Light_Background.png",
        ),
      ),
    ).toBe(
      digest(
        resolve(
          import.meta.dirname,
          "../../valet/public/brand/VAYLET_Logo_Light_Background.png",
        ),
      ),
    );
  });

  it("withholds location context when no authorized scope exists", () => {
    const nodes = elements(
      EmployeeAppHeader({ scope: null, textAlign: "right", utilities: null }),
    );
    expect(nodes.some((node) => node.props.children === "Amman Hotel")).toBe(
      false,
    );
    expect(nodes.filter((node) => node.type === "Image")).toHaveLength(1);
  });

  it("keeps the Web Back glyph fixed without transforming the brand", () => {
    const resolveIcon = (direction: "ltr" | "rtl") => {
      const icon = EmployeeBackIcon({ direction });
      return (icon.type as (props: unknown) => Element)(icon.props);
    };
    const ltrNodes = elements(resolveIcon("ltr"));
    const rtlNodes = elements(resolveIcon("rtl"));
    expect(ltrNodes[0]!.props).toMatchObject({
      height: 24,
      viewBox: "0 0 24 24",
      width: 24,
    });
    expect(ltrNodes[1]!.props).toMatchObject({
      d: "M15 18l-6-6 6-6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 1.75,
    });
    expect(rtlNodes[1]!.props).toEqual(ltrNodes[1]!.props);
    expect(employeeFrameStyles.brandLogo.transform).toBeUndefined();
  });

  it("retains localized disabled Back semantics and the 48dp touch target", () => {
    const onBack = vi.fn();
    const nodes = elements(
      EmployeeBackHeader({
        accessibilityLabel: "رجوع",
        direction: "rtl",
        disabled: true,
        onBack,
        textAlign: "right",
        title: "تسجيل مركبة",
      }),
    );
    expect(style(nodes[0]!.props.style)).toMatchObject({
      backgroundColor: employeeColors.warm,
      borderBottomColor: employeeColors.border,
      borderBottomWidth: 1,
      flexDirection: "row-reverse",
      minHeight: 56,
      paddingHorizontal: 20,
      paddingVertical: 4,
    });
    const disabled = nodes.find((node) => node.type === "Pressable")!;
    (disabled.props.onPress as () => void)();
    expect(disabled.props.accessibilityState).toEqual({ disabled: true });
    expect(style(disabled.props.style)).toMatchObject({
      height: 48,
      width: 48,
    });
    expect(onBack).not.toHaveBeenCalled();

    const enabled = elements(
      EmployeeBackHeader({
        accessibilityLabel: "Back",
        direction: "ltr",
        onBack,
        textAlign: "left",
        title: "Check in",
      }),
    ).find((node) => node.type === "Pressable")!;
    (enabled.props.onPress as () => void)();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
