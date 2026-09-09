import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));

const { NativeReturningVehicleEditor } =
  await import("../src/check-in/native-check-in-returning-step");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return elements((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...elements(node.props.children)];
}

describe("returning vehicle inline correction", () => {
  it.each(["en", "ar"] as const)(
    "supports edit, save, and cancel in %s",
    (locale) => {
      const onCancel = vi.fn();
      const onChange = vi.fn();
      const onSave = vi.fn();
      const copy = getNativeCheckInCopy(locale);
      const nodes = elements(
        NativeReturningVehicleEditor({
          copy,
          onCancel,
          onChange,
          onSave,
          textAlign: locale === "ar" ? "right" : "left",
          values: { color: "Blue", make: "Toyota", model: "Corolla" },
        }),
      );
      expect(nodes.filter((node) => node.type === "TextInput")).toHaveLength(3);
      const make = nodes.find(
        (node) =>
          node.type === "TextInput" &&
          node.props.accessibilityLabel === copy.make,
      )!;
      (make.props.onChangeText as (value: string) => void)("Honda");
      expect(onChange).toHaveBeenCalledWith({
        color: "Blue",
        make: "Honda",
        model: "Corolla",
      });
      const action = (label: string) =>
        nodes.find(
          (node) =>
            node.type === "Pressable" &&
            node.props.accessibilityLabel === label,
        )!;
      (action(copy.done).props.onPress as () => void)();
      expect(onSave).toHaveBeenCalledWith({
        color: "Blue",
        make: "Toyota",
        model: "Corolla",
      });
      (action(copy.cancel).props.onPress as () => void)();
      expect(onCancel).toHaveBeenCalledOnce();
    },
  );
});
