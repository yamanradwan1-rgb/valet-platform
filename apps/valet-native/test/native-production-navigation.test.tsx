import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const {
  NativeProductionNavigation,
  nativeProductionDestinationAvailability,
  nativeProductionNavigationItems,
  nativeProductionNavigationStyles,
} = await import("../src/shell/native-production-navigation");
const {
  EmployeeCarIcon,
  EmployeeHomeIcon,
  EmployeeScanIcon,
  EmployeeShiftIcon,
} = await import("../src/employee-ui/employee-icons");
const { employeeColors } = await import("../src/employee-ui/employee-tokens");

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

describe("Native production navigation", () => {
  it("enables truthful Tasks, Vehicles and Shift while leaving Scan disabled", () => {
    const navigate = vi.fn();
    const nodes = elements(
      NativeProductionNavigation({
        activeDestination: "shift",
        locale: "en",
        onNavigate: navigate,
        pinned: false,
      }),
    );
    const tabs = nodes.filter((node) => node.props.accessibilityRole === "tab");

    expect(
      nativeProductionNavigationItems.map((item) => item.destination),
    ).toEqual(["tasks", "vehicles", "scan", "shift"]);
    expect(nativeProductionDestinationAvailability).toEqual({
      scan: false,
      shift: true,
      tasks: true,
      vehicles: true,
    });
    expect(
      tabs.map(
        (tab) =>
          elements(tab.props.children).find((node) => node.type === "Text")
            ?.props.children,
      ),
    ).toEqual(["Tasks", "Vehicles", "Scan", "Shift"]);
    expect(tabs.map((node) => node.props.accessibilityState)).toEqual([
      { disabled: false, selected: false },
      { disabled: false, selected: false },
      { disabled: true, selected: false },
      { disabled: false, selected: true },
    ]);
    (tabs[3]?.props.onPress as () => void)();
    expect(navigate).toHaveBeenCalledWith("shift");
  });

  it("matches the Web bar, icon, label, and prominent Scan geometry", () => {
    const root = NativeProductionNavigation({
      activeDestination: "tasks",
      locale: "en",
      onNavigate: vi.fn(),
      pinned: false,
    });
    const nodes = elements(root);
    const tabs = nodes.filter((node) => node.props.accessibilityRole === "tab");
    const iconTypes = [
      EmployeeHomeIcon,
      EmployeeCarIcon,
      EmployeeScanIcon,
      EmployeeShiftIcon,
    ];

    expect(style(root.props.style)).toMatchObject({
      backgroundColor: employeeColors.white,
      borderTopColor: employeeColors.border,
      borderTopWidth: 1,
      height: 72,
      paddingHorizontal: 8,
    });
    tabs.forEach((tab, index) => {
      const icon = elements(tab.props.children).find(
        (node) => node.type === iconTypes[index],
      )!;
      expect(icon.props.size).toBe(22);
    });
    expect(nativeProductionNavigationStyles.item).toMatchObject({
      gap: 4,
      height: 72,
      paddingBottom: 12,
      paddingTop: 8,
    });
    expect(nativeProductionNavigationStyles.label).toMatchObject({
      fontSize: 10,
      fontWeight: "600",
    });
    expect(nativeProductionNavigationStyles.disabled.opacity).toBe(0.4);
    expect(nativeProductionNavigationStyles.scanIcon).toMatchObject({
      borderRadius: 18,
      height: 46,
      marginTop: -20,
      padding: 12,
      width: 46,
    });
    expect(nativeProductionNavigationStyles.scanIconDisabled).toEqual({
      backgroundColor: employeeColors.neutral,
    });
    expect(nativeProductionNavigationStyles.scanIconEnabled).toMatchObject({
      backgroundColor: employeeColors.blue,
      shadowColor: employeeColors.blue,
    });
    expect(nativeProductionNavigationStyles.scanLabel).toEqual({
      marginTop: 2,
    });
  });

  it("pins all navigation while check-in owns the foreground workflow", () => {
    const nodes = elements(
      NativeProductionNavigation({
        activeDestination: "check-in",
        locale: "ar",
        onNavigate: vi.fn(),
        pinned: true,
      }),
    );
    const tabs = nodes.filter((node) => node.props.accessibilityRole === "tab");

    expect(tabs.every((node) => node.props.disabled === true)).toBe(true);
    expect(tabs.every((node) => style(node.props.style).opacity === 0.4)).toBe(
      true,
    );
    expect(
      tabs.every(
        (node) =>
          (node.props.accessibilityState as { selected: boolean }).selected ===
          false,
      ),
    ).toBe(true);
  });

  it("selects the truthful Vehicles tab while Scan remains disabled", () => {
    const navigate = vi.fn();
    const nodes = elements(
      NativeProductionNavigation({
        activeDestination: "vehicles",
        locale: "en",
        onNavigate: navigate,
        pinned: false,
      }),
    );
    const tabs = nodes.filter((node) => node.props.accessibilityRole === "tab");
    expect(tabs[1]?.props.accessibilityState).toEqual({
      disabled: false,
      selected: true,
    });
    expect(tabs[2]?.props.accessibilityState).toEqual({
      disabled: true,
      selected: false,
    });
    (tabs[1]?.props.onPress as () => void)();
    expect(navigate).toHaveBeenCalledWith("vehicles");
  });
});
