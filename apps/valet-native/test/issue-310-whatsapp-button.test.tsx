import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
const { NativeWhatsAppPrototypeButton, whatsAppPrototypeStyles } =
  await import("../src/prototypes/whatsapp/native-whatsapp-prototype-button");
const { whatsAppDemoStates, getWhatsAppDemoCopy, parseWhatsAppDemoState } =
  await import("../src/prototypes/whatsapp/native-whatsapp-prototype-state");
const { appearanceNodes, resolveAppearanceTree } =
  await import("./appearance-render-tree");

describe("Issue #310 fixture-only WhatsApp control", () => {
  it.each(["en", "ar"] as const)(
    "identifies every %s state as a demonstration",
    (locale) => {
      for (const state of whatsAppDemoStates) {
        const onAdvance = vi.fn();
        const tree = resolveAppearanceTree(
          NativeWhatsAppPrototypeButton({
            locale,
            state,
            onAdvance,
          }),
          false,
          true,
        );
        const nodes = appearanceNodes(tree);
        const button = nodes.find(
          (n) => n.props.testID === "whatsapp-prototype-button",
        )!;
        expect(button.props.accessibilityRole).toBe("button");
        expect(button.props.accessibilityLabel).toBe(
          getWhatsAppDemoCopy(locale, state).accessibilityLabel,
        );
        expect(String(button.props.accessibilityLabel)).toContain(
          locale === "ar" ? "واتساب" : "WhatsApp",
        );
        expect(String(button.props.accessibilityLabel)).toContain(
          locale === "ar" ? "تجريبي" : "Demo",
        );
        expect(button.props.accessibilityLiveRegion).toBe("polite");
        const blocked = state === "loading" || state === "disabled";
        expect(button.props.disabled).toBe(blocked);
        (button.props.onPress as () => void)();
        (button.props.onPress as () => void)();
        expect(onAdvance).toHaveBeenCalledTimes(blocked ? 0 : 2);
        expect(nodes.some((n) => n.type === "Svg")).toBe(true);
      }
    },
  );

  it("distinguishes accepted and prospective webhook delivery in both languages", () => {
    for (const locale of ["en", "ar"] as const) {
      expect(getWhatsAppDemoCopy(locale, "accepted").label).not.toBe(
        getWhatsAppDemoCopy(locale, "delivered").label,
      );
      expect(getWhatsAppDemoCopy(locale, "delivered").label).toMatch(
        /webhook|ويب هوك/,
      );
    }
  });

  it("normalizes arbitrary fixture parameters without using them as business input", () => {
    expect(parseWhatsAppDemoState("accepted")).toBe("accepted");
    for (const input of [
      null,
      undefined,
      "send-now",
      ["accepted"],
      {},
      "https://invalid.example",
    ]) {
      expect(parseWhatsAppDemoState(input)).toBe("default");
    }
  });

  it("keeps a native touch target and readable contrast in every palette", () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5]
        .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return (
        channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
      );
    };
    const contrast = (fg: string, bg: string) => {
      const values = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return (values[0]! + 0.05) / (values[1]! + 0.05);
    };
    for (const palette of [
      whatsAppPrototypeStyles.light,
      whatsAppPrototypeStyles.dark,
    ]) {
      expect(palette.button.minHeight).toBeGreaterThanOrEqual(48);
      expect(
        contrast(palette.label.color, palette.button.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(palette.label.color, palette.pressed.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(palette.disabledLabel.color, palette.disabled.backgroundColor),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
