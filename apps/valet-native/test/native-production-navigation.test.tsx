import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeProductionNavigation } =
  await import("../src/shell/native-production-navigation");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

describe("Native production navigation", () => {
  it("enables truthful Tasks and Shift destinations while leaving future tabs disabled", () => {
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

    expect(tabs.map((node) => node.props.accessibilityState)).toEqual([
      { disabled: false, selected: false },
      { disabled: true, selected: false },
      { disabled: true, selected: false },
      { disabled: false, selected: true },
    ]);
    (tabs[3]?.props.onPress as () => void)();
    expect(navigate).toHaveBeenCalledWith("shift");
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
    expect(
      tabs.every(
        (node) =>
          (node.props.accessibilityState as { selected: boolean }).selected ===
          false,
      ),
    ).toBe(true);
  });
});
