import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

import { EmployeeBackHeader } from "../src/employee-ui/employee-back-header";
import { EmployeeButton } from "../src/employee-ui/employee-controls";
import { EmployeeField } from "../src/employee-ui/employee-fields";
import {
  employeeFontFamilies,
  employeeFontWeights,
  employeeTextStyle,
  employeeTypography,
} from "../src/employee-ui/employee-typography";
import { VehicleCard } from "../src/check-in/native-check-in-primitives";

type Element = ReactElement<Record<string, unknown>>;
type FontDefinition = { path: string; weight: number };
type FontFamily = {
  fontFamily: string;
  fontDefinitions: FontDefinition[];
};
type FontPlugin = {
  android: { fonts: FontFamily[] };
  ios: { fonts: string[] };
};

const nativeRoot = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(resolve(nativeRoot, "package.json"), "utf8"),
) as { dependencies: Record<string, string> };
const appConfig = JSON.parse(
  readFileSync(resolve(nativeRoot, "app.json"), "utf8"),
) as {
  expo: {
    android: { package: string };
    ios: { bundleIdentifier: string };
    plugins: Array<string | [string, Record<string, unknown>]>;
  };
};

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function") {
    return elements((node.type as (props: unknown) => unknown)(node.props));
  }
  return [node, ...elements(node.props.children)];
}

function style(node: Element): Record<string, unknown> {
  return Object.assign(
    {},
    ...[node.props.style].flat(Infinity).filter(Boolean),
  );
}

function fontPlugin(): FontPlugin {
  const entry = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-font",
  );
  expect(entry).toBeDefined();
  return (entry as [string, FontPlugin])[1];
}

describe("Employee Native font ownership", () => {
  it("directly owns only the approved font packages and SDK-compatible expo-font", () => {
    expect(manifest.dependencies).toMatchObject({
      "@expo-google-fonts/plus-jakarta-sans": "^0.4.2",
      "@expo-google-fonts/space-grotesk": "^0.4.1",
      "expo-font": "~57.0.3",
    });
    expect(manifest.dependencies).not.toHaveProperty("@expo-google-fonts/dev");
  });

  it("embeds the exact static Android families and weights", () => {
    const families = fontPlugin().android.fonts;
    expect(families.map(({ fontFamily }) => fontFamily)).toEqual([
      employeeFontFamilies.ui,
      employeeFontFamilies.display,
    ]);
    expect(families[0]!.fontDefinitions.map(({ weight }) => weight)).toEqual([
      400, 500, 600, 700, 800,
    ]);
    expect(families[1]!.fontDefinitions.map(({ weight }) => weight)).toEqual([
      400, 500, 600, 700,
    ]);
    for (const { fontDefinitions } of families) {
      for (const { path } of fontDefinitions) {
        expect(path).toMatch(/\.ttf$/);
        expect(path).not.toMatch(/italic|variable/i);
        expect(existsSync(resolve(nativeRoot, path))).toBe(true);
      }
    }
  });

  it("embeds the same nine static assets for iOS without identifier drift", () => {
    const fonts = fontPlugin().ios.fonts;
    expect(fonts).toHaveLength(9);
    expect(new Set(fonts)).toHaveLength(9);
    expect(fonts.every((path) => existsSync(resolve(nativeRoot, path)))).toBe(
      true,
    );
    expect(fonts.join(" ")).not.toMatch(/italic|variable/i);
    expect(appConfig.expo.android.package).toBe("com.vaylet.employee");
    expect(appConfig.expo.ios.bundleIdentifier).toBe("com.vaylet.employee");
  });
});

describe("Employee Native semantic typography", () => {
  it("keeps general roles in Plus Jakarta Sans and identity roles in Space Grotesk", () => {
    for (const role of [
      "body",
      "small",
      "label",
      "header",
      "button",
      "phoneField",
      "badge",
    ] as const) {
      expect(employeeTypography[role].fontFamily).toBe(employeeFontFamilies.ui);
    }
    for (const role of ["vehicle", "plate", "plateField"] as const) {
      expect(employeeTypography[role].fontFamily).toBe(
        employeeFontFamilies.display,
      );
    }
    const supported = new Set(Object.values(employeeFontWeights));
    for (const role of Object.values(employeeTypography)) {
      expect(supported.has(role.fontWeight)).toBe(true);
    }
  });

  it("renders BackHeader and buttons with the general UI family", () => {
    const onBack = vi.fn();
    const onPress = vi.fn();
    const header = elements(
      <EmployeeBackHeader
        accessibilityLabel="Back"
        direction="ltr"
        onBack={onBack}
        textAlign="left"
        title="Check-In"
      />,
    ).find((node) => node.props.accessibilityRole === "header")!;
    const button = elements(
      <EmployeeButton label="Continue" onPress={onPress} />,
    ).find((node) => node.props.children === "Continue")!;
    expect(style(header).fontFamily).toBe(employeeFontFamilies.ui);
    expect(style(button)).toMatchObject({
      fontFamily: employeeFontFamilies.ui,
      fontWeight: "600",
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders plate fields as centered LTR display text and phones as LTR UI text", () => {
    for (const plate of ["12-34567", "ABC-123", "1-2-3", "A12-34B"]) {
      const input = elements(
        <EmployeeField
          accessibilityLabel="Plate"
          alignment="center"
          kind="identifier"
          maxLength={40}
          onChangeText={vi.fn()}
          textAlign="right"
          value={plate}
          visualRole="plate"
        />,
      ).find((node) => node.type === "TextInput")!;
      expect(input.props.value).toBe(plate);
      expect(style(input)).toMatchObject({
        fontFamily: employeeFontFamilies.display,
        textAlign: "center",
        writingDirection: "ltr",
      });
    }
    const phone = elements(
      <EmployeeField
        accessibilityLabel="الهاتف"
        inputMode="tel"
        kind="identifier"
        maxLength={20}
        onChangeText={vi.fn()}
        textAlign="right"
        value="790000000"
        visualRole="phone"
      />,
    ).find((node) => node.type === "TextInput")!;
    expect(style(phone)).toMatchObject({
      fontFamily: employeeFontFamilies.ui,
      writingDirection: "ltr",
    });
  });

  it.each(["Toyota كامري", "تويوتا Camry", "BMW X5", "مرسيدس GLE", "Kia K5"])(
    "keeps mixed vehicle identity %s human-directed with one accessible label",
    (name) => {
      const [make, ...model] = name.split(" ");
      const tree = elements(
        <VehicleCard
          fallback="المركبة"
          textAlign="right"
          vehicle={{
            color: null,
            make,
            model: model.join(" "),
            plateCountry: "JO",
            plateNumberRaw: "12-34567",
            temporaryDescriptor: null,
            vehicleId: "vehicle-id",
            vehicleUpdatedAt: "date",
          }}
        />,
      );
      const identity = tree.find((node) => node.props.children === name)!;
      expect(style(identity)).toMatchObject({
        fontFamily: employeeFontFamilies.display,
        textAlign: "right",
        writingDirection: "rtl",
      });
      expect(tree[0]!.props.accessibilityLabel).toBe(`${name}, 12-34567`);
    },
  );

  it("preserves Arabic human direction and LTR identifier direction", () => {
    expect(employeeTextStyle("human", "right")).toEqual({
      textAlign: "right",
      writingDirection: "rtl",
    });
    expect(employeeTextStyle("identifier", "right")).toEqual({
      textAlign: "left",
      writingDirection: "ltr",
    });
  });
});
