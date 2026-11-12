import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

let hookIndex = 0;
let hookSlots: unknown[] = [];
const dismiss = vi.fn();

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as object),
    useEffect: vi.fn(),
    useState: (initial: unknown) => {
      const index = hookIndex++;
      if (!(index in hookSlots))
        hookSlots[index] = typeof initial === "function" ? initial() : initial;
      return [
        hookSlots[index],
        (next: unknown) => {
          hookSlots[index] = next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = hookIndex++;
      if (!(index in hookSlots)) hookSlots[index] = { current: initial };
      return hookSlots[index];
    },
  };
});
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Keyboard: { dismiss },
  Pressable: "Pressable",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));

const { NativeCheckInColorSelector } =
  await import("../src/check-in/native-check-in-color-selector");
const { NativeVehicleDetailsStep } =
  await import("../src/check-in/native-check-in-vehicle-details-step");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");
const { nativeVehicleColorPresets } =
  await import("../src/check-in/native-check-in-color-values");
const { nativeCheckInColorStylesTheme } =
  await import("../src/check-in/native-check-in-color-styles");

type Node = ReactElement<Record<string, unknown>>;

function elements(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(elements);
  if (!root || typeof root !== "object" || !("props" in root)) return [];
  const node = root as Node;
  if (typeof node.type === "function")
    return elements((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...elements(node.props.children)];
}

function tile(nodes: Node[], label: string): Node {
  const found = nodes.find(
    (node) =>
      node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

function press(node: Node) {
  (node.props.onPress as () => void)();
}

function renderSelector(
  color: string | null,
  locale: "en" | "ar",
  onChange: (next: string | null) => void,
) {
  hookIndex = 0;
  return elements(
    NativeCheckInColorSelector({
      color,
      label: locale === "ar" ? "اللون" : "Color",
      locale,
      onChange,
      textAlign: locale === "ar" ? "right" : "left",
    }),
  );
}

beforeEach(() => {
  hookIndex = 0;
  hookSlots = [];
  dismiss.mockClear();
});

describe("#451 Native Vehicle Color / V2 Variant A", () => {
  it("presents exactly nine visible 3×3 labeled choices with 48dp targets", () => {
    const nodes = renderSelector(null, "en", vi.fn());
    const names = nativeVehicleColorPresets.map((choice) => choice.en);
    expect(nativeVehicleColorPresets).toHaveLength(9);
    for (const name of names) {
      expect(tile(nodes, name).props.accessibilityState).toEqual({
        selected: false,
      });
    }
    expect(
      nodes.filter(
        (node) =>
          node.type === "View" &&
          node.props.style === nativeCheckInColorStylesTheme.light.row,
      ),
    ).toHaveLength(3);
    const arabic = renderSelector(null, "ar", vi.fn());
    expect(
      arabic.some(
        (node) =>
          Array.isArray(node.props.style) &&
          node.props.style.some(
            (part: { direction?: string }) => part?.direction === "rtl",
          ),
      ),
    ).toBe(true);
    expect(nodes.filter((node) => node.type === "TextInput")).toHaveLength(0);
    expect(nativeCheckInColorStylesTheme.light.grid).toEqual({ gap: 4 });
    expect(nativeCheckInColorStylesTheme.light.row).toMatchObject({ gap: 4 });
    expect(nativeCheckInColorStylesTheme.light.tile).toMatchObject({
      minHeight: 48,
    });
    expect(nativeCheckInColorStylesTheme.light.swatch).toMatchObject({
      width: 22,
      height: 15,
    });
    expect(nativeCheckInColorStylesTheme.dark.selected).toMatchObject({
      backgroundColor: "#142D52",
      borderColor: "#80B0FF",
    });
    expect(nativeCheckInColorStylesTheme.light.selected).toMatchObject({
      backgroundColor: "#EDF4FF",
      borderColor: "#0F54CB",
    });
  });

  it("stores canonical English values for every localized preset, including one Beige / Gold", () => {
    for (const locale of ["en", "ar"] as const) {
      for (const preset of nativeVehicleColorPresets) {
        hookSlots = [];
        const onChange = vi.fn();
        const nodes = renderSelector(null, locale, onChange);
        press(tile(nodes, preset[locale]));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(preset.value);
        hookSlots = [];
        const savedChange = vi.fn();
        const saved = renderSelector(preset.value, locale, savedChange);
        const selected = tile(saved, preset[locale]);
        expect(selected.props.accessibilityState).toEqual({ selected: true });
        press(selected);
        press(selected);
        expect(savedChange).not.toHaveBeenCalled();
      }
    }
  });

  it("preserves exact stored custom, legacy and Arabic strings without rewriting", () => {
    for (const saved of [
      "Midnight Plum",
      "blue",
      "Beige",
      "Gold",
      "أسود",
      "سماوي",
    ]) {
      hookSlots = [];
      const onChange = vi.fn();
      const nodes = renderSelector(saved, "ar", onChange);
      expect(tile(nodes, "لون آخر").props.accessibilityState).toMatchObject({
        expanded: true,
      });
      expect(nodes.find((node) => node.type === "TextInput")?.props.value).toBe(
        saved,
      );
      expect(onChange).not.toHaveBeenCalled();
    }
    hookSlots = [];
    const nodes = renderSelector("White", "en", vi.fn());
    expect(tile(nodes, "White").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(nodes.filter((node) => node.type === "TextInput")).toHaveLength(0);
  });

  it("buffers Other text while switching presets; Clear removes both buffer and selection", () => {
    let value: string | null = null;
    const onChange = vi.fn((next: string | null) => {
      value = next;
    });
    const render = () => renderSelector(value, "en", onChange);

    press(tile(render(), "Other color"));
    let nodes = render();
    const custom = nodes.find((node) => node.type === "TextInput")!;
    expect(custom.props.maxLength).toBe(160);
    (custom.props.onChangeText as (next: string) => void)("Midnight Plum");
    expect(value).toBe("Midnight Plum");
    press(tile(render(), "Blue"));
    expect(value).toBe("Blue");
    press(tile(render(), "Other color"));
    nodes = render();
    expect(value).toBe("Midnight Plum");
    expect(nodes.find((node) => node.type === "TextInput")?.props.value).toBe(
      "Midnight Plum",
    );
    press(tile(nodes, "Clear color"));
    expect(value).toBeNull();
    expect(render().find((node) => node.type === "TextInput")).toBeUndefined();
    press(tile(render(), "Other color"));
    expect(value).toBeNull();
    expect(
      render().find((node) => node.type === "TextInput")?.props.value,
    ).toBe("");
  });

  it("keeps Other expanded while blank input serializes as null", () => {
    let value: string | null = "Midnight Plum";
    const onChange = vi.fn((next: string | null) => {
      value = next;
    });
    const render = () => renderSelector(value, "en", onChange);
    const input = render().find((node) => node.type === "TextInput")!;
    (input.props.onChangeText as (next: string) => void)("   ");
    expect(value).toBeNull();
    const after = render();
    expect(tile(after, "Other color").props.accessibilityState).toMatchObject({
      expanded: true,
    });
    expect(after.find((node) => node.type === "TextInput")?.props.value).toBe(
      "   ",
    );
    (
      after.find((node) => node.type === "TextInput")!.props.onChangeText as (
        next: string,
      ) => void
    )("");
    expect(value).toBeNull();
    expect(
      render().find((node) => node.type === "TextInput")?.props.value,
    ).toBe("");
  });

  it("keeps the Vehicle details Continue and Skip actions on the portable session", () => {
    const session = {
      continueVehicleDetails: vi.fn(),
      setPreIntakeVehicleDetails: vi.fn(),
    } as unknown as EmployeeCheckInSession;
    const snapshot = {
      error: null,
      phase: "vehicle-details",
      vehicle: {
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: "",
        make: "Toyota",
        model: "Corolla",
        color: null,
      },
    } as EmployeeCheckInSnapshot;
    const nodes = elements(
      NativeVehicleDetailsStep({
        copy: getNativeCheckInCopy("en"),
        locale: "en",
        session,
        snapshot,
        textAlign: "left",
      }),
    );
    press(tile(nodes, "Red"));
    expect(session.setPreIntakeVehicleDetails).toHaveBeenCalledWith({
      color: "Red",
    });
    press(tile(nodes, "Continue"));
    expect(session.continueVehicleDetails).toHaveBeenCalledTimes(1);
    press(tile(nodes, "Skip vehicle details"));
    expect(session.setPreIntakeVehicleDetails).toHaveBeenCalledWith({
      color: null,
      make: null,
      model: null,
    });
    expect(session.continueVehicleDetails).toHaveBeenCalledTimes(2);
  });
});
