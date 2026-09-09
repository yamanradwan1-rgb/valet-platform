import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("react-native-svg", () => ({
  Circle: "Circle",
  Path: "Path",
  Rect: "Rect",
  default: "Svg",
}));

const {
  NativeScanHubScreen,
  NATIVE_SCAN_HUB_COLUMNS,
  nativeScanHubScreenStyles,
} = await import("../src/scan/native-scan-hub-screen");
const { NativeScanHubTile, nativeScanHubTileStyles } =
  await import("../src/scan/native-scan-hub-tile");
const {
  NativeScanHandoffIcon,
  NativeScanKeyIcon,
  NativeScanPlateIcon,
  NativeScanSpotIcon,
} = await import("../src/scan/native-scan-hub-icons");
const { employeeColors, employeeRadius } =
  await import("../src/employee-ui/employee-tokens");
const { getNativeScanHubCopy } =
  await import("../src/scan/native-scan-hub-copy");

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

const unavailableGates = {
  keySlot: {
    available: false,
    context: null,
    disabledReason: "keySlotDisabled",
  },
  licensePlate: { available: true, context: null, disabledReason: null },
  parkingSpot: {
    available: false,
    context: null,
    disabledReason: "parkingDisabled",
  },
  pickupHandoff: {
    available: false,
    context: null,
    disabledReason: "retrievalDisabled",
  },
} as const;

function tiles(locale: "ar" | "en" = "en", navigate = vi.fn()) {
  const root = NativeScanHubScreen({
    gates: unavailableGates,
    locale,
    navigate,
    textAlign: locale === "ar" ? "right" : "left",
  });
  return {
    navigate,
    nodes: elements(root),
    root,
    tiles: elements(root).filter((node) => node.type === NativeScanHubTile),
  };
}

describe("Native Scan Hub visual and accessibility contract", () => {
  it("renders exactly four tiles in Web logical order with exact EN/AR copy", () => {
    const en = tiles("en").tiles;
    const ar = tiles("ar").tiles;
    expect(en.map((tile) => tile.props.label)).toEqual([
      "License Plate",
      "Key slot",
      "Parking Spot",
      "Pickup Handoff",
    ]);
    expect(ar.map((tile) => tile.props.label)).toEqual([
      "لوحة المركبة",
      "خانة المفتاح",
      "موقع الإيقاف",
      "الاستلام والتسليم",
    ]);
    expect(ar.map((tile) => tile.props.subtitle)).toEqual([
      "تسجيل مركبة جديدة",
      "افتح عملية المركبة أولاً.",
      "افتح مهمة إيقاف نشطة أولاً.",
      "افتح مهمة استرجاع نشطة أولاً.",
    ]);
    const arabicPlate = NativeScanHubTile(ar[0]!.props);
    const plateTexts = elements(arabicPlate).filter(
      (node) => node.type === "Text",
    );
    expect(style(plateTexts[0]?.props.style)).toMatchObject({
      textAlign: "right",
      writingDirection: "rtl",
    });
    expect(nativeScanHubScreenStyles.grid).not.toHaveProperty("direction");
  });

  it("matches screen, two-column grid, tile, type, and disabled geometry", () => {
    expect(NATIVE_SCAN_HUB_COLUMNS).toBe(2);
    expect(nativeScanHubScreenStyles.screen).toEqual({ padding: 20 });
    expect(nativeScanHubScreenStyles.grid).toMatchObject({
      columnGap: 16,
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 16,
    });
    expect(nativeScanHubScreenStyles.title).toMatchObject({
      fontSize: 20,
      fontWeight: "700",
      marginBottom: 4,
    });
    expect(nativeScanHubScreenStyles.subtitle).toMatchObject({
      fontSize: 14,
      marginBottom: 24,
    });
    expect(nativeScanHubTileStyles.tile).toMatchObject({
      borderRadius: 16,
      borderWidth: 1,
      flexBasis: "45%",
      gap: 12,
      minHeight: 132,
      padding: 16,
    });
    expect(nativeScanHubTileStyles.iconBlock).toMatchObject({
      borderRadius: 12,
      height: 44,
      width: 44,
    });
    expect(nativeScanHubTileStyles.disabled.opacity).toBe(0.5);
    expect(nativeScanHubTileStyles.label).toMatchObject({
      fontSize: 14,
      fontWeight: "600",
      lineHeight: 18,
    });
    expect(nativeScanHubTileStyles.subtitle).toMatchObject({
      fontSize: 12,
      lineHeight: 16,
      marginTop: 4,
    });
    expect(nativeScanHubTileStyles.pressed).toEqual({
      transform: [{ scale: 0.97 }],
    });
  });

  it("uses exact accent tokens and 26px Web glyph concepts", () => {
    const rendered = tiles().tiles;
    expect(rendered.map((tile) => tile.props.accent)).toEqual([
      employeeColors.blue,
      employeeColors.navy3,
      employeeColors.warning,
      employeeColors.success,
    ]);
    expect(rendered.map((tile) => (tile.props.glyph as Element).type)).toEqual([
      NativeScanPlateIcon,
      NativeScanKeyIcon,
      NativeScanSpotIcon,
      NativeScanHandoffIcon,
    ]);
    for (const Icon of [
      NativeScanPlateIcon,
      NativeScanKeyIcon,
      NativeScanSpotIcon,
      NativeScanHandoffIcon,
    ]) {
      expect(Icon().props).toMatchObject({ height: 26, width: 26 });
    }
    expect(employeeRadius.primary).toBe(16);
  });

  it("makes disabled tiles truly inert and exposes their visible reason", () => {
    const rendered = tiles().tiles;
    for (const tile of rendered.slice(1)) {
      expect(tile.props.disabled).toBe(true);
      const pressable = NativeScanHubTile(tile.props).props;
      expect(pressable.disabled).toBe(true);
      expect(pressable.accessibilityState).toEqual({ disabled: true });
      expect(pressable.onPress).toBeUndefined();
      expect(pressable.accessibilityLabel).toContain(tile.props.subtitle);
    }
  });

  it("gives enabled tiles a button role and launches exactly once", () => {
    const { navigate, tiles: rendered } = tiles();
    const plate = rendered[0]!;
    const pressable = NativeScanHubTile(plate.props).props;
    expect(pressable.accessibilityRole).toBe("button");
    expect(pressable.accessibilityState).toEqual({ disabled: false });
    expect(pressable.accessibilityLabel).toBe(
      `${getNativeScanHubCopy("en").licensePlate}. ${getNativeScanHubCopy("en").licensePlateSubtitle}`,
    );
    (pressable.onPress as () => void)();
    expect(navigate).toHaveBeenCalledExactlyOnceWith("check-in");
  });
});
