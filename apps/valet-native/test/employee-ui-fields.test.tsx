import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));

import { EmployeeField } from "../src/employee-ui/employee-fields";
import { employeeTextStyle } from "../src/employee-ui/employee-typography";
import { CheckInField } from "../src/check-in/native-check-in-primitives";
import { checkInTextStyle } from "../src/check-in/native-check-in-presentation";

type Element = ReactElement<Record<string, unknown>>;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return nodes((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...nodes(node.props.children)];
}
function style(node: Element): Record<string, unknown> {
  return Object.assign(
    {},
    ...[node.props.style].flat(Infinity).filter(Boolean),
  );
}

describe("Employee field roles and Native Check-In compatibility", () => {
  it.each([
    ["standard", 48, 12, 14],
    ["plate", 56, 16, 20],
    ["phone", 56, 12, 16],
  ] as const)(
    "applies the compatible %s field role",
    (visualRole, height, radius, size) => {
      const tree = nodes(
        <EmployeeField
          visualRole={visualRole}
          kind="identifier"
          textAlign="right"
          accessibilityLabel="Plate"
          maxLength={40}
          onChangeText={vi.fn()}
          value="12-34567"
        />,
      );
      const input = tree.find((node) => node.type === "TextInput")!;
      expect(style(input)).toMatchObject({
        height,
        borderRadius: radius,
        fontSize: size,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: "#DDE4EC",
        backgroundColor: "#FFFFFF",
      });
      expect(style(tree[0]!).gap).toBe(8);
      const label = tree.find((node) => node.type === "Text")!;
      expect(style(label)).toMatchObject({
        fontSize: 14,
        fontWeight: "600",
        textAlign: "right",
        writingDirection: "rtl",
      });
    },
  );
  it.each(["left", "right"] as const)(
    "keeps identifier LTR under %s locale alignment",
    (textAlign) => {
      expect(employeeTextStyle("identifier", textAlign)).toEqual({
        textAlign: "left",
        writingDirection: "ltr",
      });
      expect(checkInTextStyle("identifier", textAlign)).toEqual(
        employeeTextStyle("identifier", textAlign),
      );
      expect(employeeTextStyle("identifier", textAlign, "center")).toEqual({
        textAlign: "center",
        writingDirection: "ltr",
      });
    },
  );
  it("can center a plate without changing surrounding Arabic direction", () => {
    const tree = nodes(
      <EmployeeField
        visualRole="plate"
        kind="identifier"
        textAlign="right"
        alignment="center"
        accessibilityLabel="اللوحة"
        maxLength={40}
        onChangeText={vi.fn()}
        value="12-34567"
      />,
    );
    expect(
      style(tree.find((node) => node.type === "TextInput")!),
    ).toMatchObject({ textAlign: "center", writingDirection: "ltr" });
    expect(style(tree.find((node) => node.type === "Text")!)).toMatchObject({
      textAlign: "right",
      writingDirection: "rtl",
    });
  });
  it.each(["left", "right"] as const)(
    "preserves human text and callbacks under %s alignment",
    (textAlign) => {
      const onChangeText = vi.fn();
      const tree = nodes(
        <CheckInField
          kind="human"
          textAlign={textAlign}
          accessibilityLabel="Description"
          maxLength={160}
          onChangeText={onChangeText}
          value="تويوتا فضية"
          placeholder="Describe vehicle"
        />,
      );
      const input = tree.find((node) => node.type === "TextInput")!;
      expect(input.props).toMatchObject({
        accessibilityLabel: "Description",
        maxLength: 160,
        value: "تويوتا فضية",
        placeholder: "Describe vehicle",
        autoCapitalize: "sentences",
        autoCorrect: false,
      });
      expect(style(input)).toMatchObject({
        height: 48,
        writingDirection: textAlign === "right" ? "rtl" : "ltr",
        textAlign,
      });
      (input.props.onChangeText as (value: string) => void)("سيارة بيضاء");
      expect(onChangeText).toHaveBeenCalledWith("سيارة بيضاء");
    },
  );
  it("keeps phone prefix separate, input LTR and telephone keyboard unchanged", () => {
    const onChangeText = vi.fn();
    const tree = nodes(
      <CheckInField
        kind="identifier"
        textAlign="right"
        accessibilityLabel="الهاتف"
        prefix="+962"
        inputMode="tel"
        maxLength={20}
        onChangeText={onChangeText}
        value="790000000"
      />,
    );
    const input = tree.find((node) => node.type === "TextInput")!;
    const prefix = tree.find((node) => node.props.children === "+962")!;
    expect(input.props).toMatchObject({
      inputMode: "tel",
      maxLength: 20,
      value: "790000000",
      autoCapitalize: "characters",
    });
    for (const field of [input, prefix]) {
      expect(style(field)).toMatchObject({
        height: 56,
        borderRadius: 12,
        textAlign: "left",
        writingDirection: "ltr",
      });
    }
    expect(tree.some((node) => style(node).direction === "ltr")).toBe(true);
    (input.props.onChangeText as (value: string) => void)("791111111");
    expect(onChangeText).toHaveBeenCalledWith("791111111");
  });

  it("decouples canonical 48px geometry from 20px operational value text", () => {
    const input = nodes(
      <EmployeeField
        accessibilityLabel="Parking spot"
        alignment="center"
        kind="identifier"
        maxLength={20}
        onChangeText={vi.fn()}
        size="standard"
        textAlign="left"
        textRole="value"
        value="A-12"
      />,
    ).find((node) => node.type === "TextInput")!;
    expect(style(input)).toMatchObject({
      borderRadius: 12,
      fontFamily: "Space Grotesk",
      fontSize: 20,
      fontWeight: "700",
      height: 48,
    });
  });
});
