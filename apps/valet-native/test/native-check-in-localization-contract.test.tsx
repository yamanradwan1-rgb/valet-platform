import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("react-native", () => ({
  Modal: "Modal",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));
vi.mock("expo-status-bar", () => ({ StatusBar: "StatusBar" }));

import { getNativeCheckInCopy } from "../src/check-in/native-check-in-copy";
import { NativeCheckInIdentityContext } from "../src/check-in/native-check-in-identity-context";
import { getNativePlateCameraCopy } from "../src/check-in/native-plate-camera-copy";
import {
  NativePlateCountrySelector,
  PLATE_COUNTRIES,
  plateCountryLabel,
} from "../src/check-in/native-plate-country-selector";
import { VehicleCard } from "../src/check-in/native-check-in-primitives";
import {
  EmployeeBackHeader,
  employeeBackHeaderStyles,
} from "../src/employee-ui/employee-back-header";
import { employeeControlStyles } from "../src/employee-ui/employee-controls";
import { employeeFrameStyles } from "../src/employee-ui/employee-frame";
import { EmployeeBackIcon } from "../src/employee-ui/employee-icons";
import { employeeTextStyle } from "../src/employee-ui/employee-typography";

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function") {
    return elements((node.type as (props: unknown) => unknown)(node.props));
  }
  return [node, ...elements(node.props.children)];
}

function style(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    return Object.assign(
      {},
      ...value.flat(Infinity).filter(Boolean).map(style),
    );
  }
  if (typeof value === "function") {
    return style(
      (value as (state: { pressed: boolean }) => unknown)({
        pressed: false,
      }),
    );
  }
  return (value ?? {}) as Record<string, unknown>;
}

describe("MOB-010 Patch 6 localization and direction contract", () => {
  it("keeps Check-In and camera copy complete in both supported locales", () => {
    const en = getNativeCheckInCopy("en");
    const ar = getNativeCheckInCopy("ar");
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(ar.countryNames).sort()).toEqual(
      [...PLATE_COUNTRIES].sort(),
    );

    const cameraEn = getNativePlateCameraCopy("en");
    const cameraAr = getNativePlateCameraCopy("ar");
    expect(Object.keys(cameraAr).sort()).toEqual(Object.keys(cameraEn).sort());
    expect(Object.keys(cameraAr.phases).sort()).toEqual(
      Object.keys(cameraEn.phases).sort(),
    );
  });

  it("selects camera language from locale, independently of alignment", () => {
    expect(getNativePlateCameraCopy("en").open).toBe("Open camera");
    expect(getNativePlateCameraCopy("ar").open).toBe("فتح الكاميرا");
    expect(employeeTextStyle("human", "right")).toEqual({
      textAlign: "right",
      writingDirection: "rtl",
    });
    expect(employeeTextStyle("human", "left")).toEqual({
      textAlign: "left",
      writingDirection: "ltr",
    });
  });

  it("keeps every camera phase localized and assistive-only truthful", () => {
    const forbidden =
      /plate (?:captured|detected)|high confidence|تم (?:التقاط|اكتشاف) اللوحة|ثقة عالية/i;
    for (const locale of ["en", "ar"] as const) {
      const copy = getNativePlateCameraCopy(locale);
      expect(Object.values(copy.phases).join(" ")).not.toMatch(forbidden);
      expect(copy.phases.preview).toMatch(
        locale === "en" ? /reading plate/i : /جارٍ قراءة اللوحة/,
      );
      expect(copy.enter).toMatch(
        locale === "en" ? /enter manually/i : /إدخال يدوي/,
      );
      expect(copy.retry).toMatch(locale === "en" ? /retry/i : /إعادة/);
      expect(copy.settings).toMatch(locale === "en" ? /settings/i : /إعدادات/);
    }
  });

  it("localizes all country names while preserving exact codes", () => {
    const en = getNativeCheckInCopy("en");
    const ar = getNativeCheckInCopy("ar");
    expect(
      PLATE_COUNTRIES.map((country) => plateCountryLabel(country, ar)),
    ).toEqual([
      "الأردن (JO)",
      "الإمارات (AE)",
      "السعودية (SA)",
      "الكويت (KW)",
      "البحرين (BH)",
      "أخرى",
    ]);
    expect(plateCountryLabel("JO", en)).toBe("Jordan (JO)");

    const tree = elements(
      NativePlateCountrySelector({
        copy: ar,
        onChange: vi.fn(),
        textAlign: "right",
        value: "JO",
      }),
    );
    const codes = tree.filter((node) =>
      /^\([A-Z]{2}\)$/.test([node.props.children].flat().join("")),
    );
    expect(codes).toHaveLength(6);
    for (const code of codes) {
      expect(style(code.props.style).writingDirection).toBe("ltr");
    }
  });

  it.each(["12-34567", "ABC-123", "1-2-3", "A12-34B"])(
    "keeps centered plate %s LTR in either locale",
    (plate) => {
      for (const [locale, alignment] of [
        ["en", "left"],
        ["ar", "right"],
      ] as const) {
        const tree = elements(
          NativeCheckInIdentityContext({
            copy: getNativeCheckInCopy(locale),
            snapshot: {
              active: null,
              customerPhone: "",
              error: null,
              identityGeneration: 1,
              locationId: "location",
              phase: "confirm",
              recognizedVehicle: null,
              recoverables: [],
              recoveryChecked: false,
              vehicle: {
                mode: "CONFIRMED_PLATE",
                plateCountry: "JO",
                plateNumberRaw: plate,
                temporaryDescriptor: "",
              },
            },
            textAlign: alignment,
          }),
        );
        const centered = tree.find(
          (node) =>
            node.props.children === plate &&
            style(node.props.style).textAlign === "center",
        )!;
        expect(style(centered.props.style)).toMatchObject({
          textAlign: "center",
          writingDirection: "ltr",
        });
      }
    },
  );

  it.each(["Toyota كامري", "تويوتا Camry", "BMW X5", "مرسيدس GLE", "Kia K5"])(
    "treats mixed vehicle name %s as human Arabic content",
    (name) => {
      const [make, ...model] = name.split(" ");
      const tree = elements(
        VehicleCard({
          fallback: "المركبة",
          textAlign: "right",
          vehicle: {
            color: null,
            make,
            model: model.join(" "),
            plateCountry: "JO",
            plateNumberRaw: "12-34567",
            temporaryDescriptor: null,
            vehicleId: "vehicle-id",
            vehicleUpdatedAt: "date",
          },
        }),
      );
      const nameNode = tree.find((node) => node.props.children === name)!;
      expect(style(nameNode.props.style)).toMatchObject({
        textAlign: "right",
        writingDirection: "rtl",
      });
    },
  );

  it("keeps the Web Back glyph fixed but never transforms the VAYLET brand", () => {
    const rtl = elements(
      EmployeeBackHeader({
        accessibilityLabel: "رجوع",
        direction: "rtl",
        onBack: vi.fn(),
        textAlign: "right",
        title: "نتيجة سجل الوصول غير معروفة",
      }),
    )[0]!;
    expect(style(rtl.props.style)).toMatchObject({
      flexDirection: "row-reverse",
      minHeight: 56,
    });
    const ltr = elements(
      EmployeeBackHeader({
        accessibilityLabel: "Back",
        direction: "ltr",
        onBack: vi.fn(),
        textAlign: "left",
        title: "Check-In Discovery",
      }),
    )[0]!;
    expect(style(ltr.props.style).flexDirection).toBe("row");
    const stroke = elements(EmployeeBackIcon({ direction: "rtl" }))[1]!;
    expect(stroke.props).toMatchObject({
      d: "M15 18l-6-6 6-6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 1.75,
    });
    expect(style(stroke.props.style).transform).toBeUndefined();
    expect(employeeFrameStyles.brandLogo.transform).toBeUndefined();
  });

  it("uses minimum dimensions and shrinkable human labels for large text", () => {
    expect(employeeBackHeaderStyles.header).toMatchObject({ minHeight: 56 });
    expect(employeeBackHeaderStyles.header).not.toHaveProperty("height");
    expect(employeeFrameStyles.appHeader).toMatchObject({ height: 64 });
    expect(employeeFrameStyles.appHeader).not.toHaveProperty("minHeight");
    expect(employeeControlStyles.buttonLabel.flexShrink).toBe(1);
  });
});
