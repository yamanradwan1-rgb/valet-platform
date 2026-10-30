import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  emptyCheckInContinuation,
  type EmployeeCheckInSnapshot,
} from "@valet/employee-client";

vi.mock("react-native", () => ({
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeCheckInIdentityContext, nativeCheckInIdentityStyles } =
  await import("../src/check-in/native-check-in-identity-context");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");
const { content, elements, style } =
  await import("./native-check-in-condition-test-support");

type Element = ReactElement<Record<string, unknown>>;

function snapshot(
  vehicle: EmployeeCheckInSnapshot["vehicle"],
): EmployeeCheckInSnapshot {
  return {
    active: null,
    continuation: emptyCheckInContinuation(),
    customerPhone: "",
    error: null,
    identityGeneration: 1,
    locationId: "location-id",
    phase: "confirm",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle,
  };
}

function render(
  locale: "en" | "ar",
  presentation: "camera" | "manual",
  vehicle: EmployeeCheckInSnapshot["vehicle"],
) {
  return elements(
    NativeCheckInIdentityContext({
      copy: getNativeCheckInCopy(locale),
      presentation,
      snapshot: snapshot(vehicle),
      textAlign: locale === "ar" ? "right" : "left",
    }),
  );
}

function text(nodes: Element[], value: string) {
  return nodes.find(
    (node) => node.type === "Text" && node.props.children === value,
  )!;
}

describe("UI-PARITY-08 plate confirmation vehicle details", () => {
  it.each([
    ["en", "camera", "Detected", "License Plate · Jordan"],
    ["en", "manual", "Manual Entry", "Entered plate · Jordan"],
    ["ar", "camera", "تم الاكتشاف", "لوحة المركبة · الأردن"],
    ["ar", "manual", "إدخال يدوي", "لوحة مدخلة · الأردن"],
  ] as const)(
    "keeps the hero and localized %s %s context",
    (locale, presentation, status, context) => {
      const nodes = render(locale, presentation, {
        color: "Black",
        make: "Toyota",
        mode: "CONFIRMED_PLATE",
        model: "Camry",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: "",
      });
      expect(text(nodes, status)).toBeDefined();
      expect(text(nodes, "12-34567")).toBeDefined();
      expect(content(nodes).replace(/\s+/g, " ")).toContain(context);
      expect(nativeCheckInIdentityStyles.plate.fontSize).toBe(36);
      expect(
        text(nodes, locale === "en" ? "Vehicle details" : "تفاصيل المركبة"),
      ).toBeDefined();
      expect(style(text(nodes, "Toyota Camry"))).toMatchObject({
        fontSize: 26,
      });
      expect(style(text(nodes, "12-34567"))).toMatchObject({
        writingDirection: "ltr",
      });
      expect(text(nodes, "Black")).toBeDefined();
    },
  );

  it("uses exact fallback and temporary-descriptor semantics", () => {
    const fallback = render("en", "manual", {
      color: null,
      make: null,
      mode: "CONFIRMED_PLATE",
      model: null,
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "",
    });
    expect(text(fallback, "Vehicle")).toBeDefined();
    expect(text(fallback, "Not specified")).toBeDefined();

    const descriptor = render("en", "camera", {
      color: null,
      make: null,
      mode: "TEMPORARY_DESCRIPTOR",
      model: null,
      plateCountry: "JO",
      plateNumberRaw: "",
      temporaryDescriptor: "Silver Toyota SUV",
    });
    expect(text(descriptor, "Temporary Descriptor")).toBeDefined();
    expect(nativeCheckInIdentityStyles.descriptor.fontSize).toBe(36);
    expect(style(text(descriptor, "Silver Toyota SUV"))).toMatchObject({
      writingDirection: "ltr",
    });
  });
});
