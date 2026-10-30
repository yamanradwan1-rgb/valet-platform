import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
} from "@valet/employee-client";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeBusyStep } =
  await import("../src/check-in/native-check-in-state-steps");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");
const { initialCheckInCapturePresentation } =
  await import("../src/check-in/native-check-in-presentation");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return elements((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...elements(node.props.children)];
}

function text(nodes: Element[]): string {
  return nodes
    .flatMap((node) => [node.props.children].flat())
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function snapshot(
  vehicle: EmployeeCheckInSnapshot["vehicle"] = {
    mode: "CONFIRMED_PLATE",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: "",
  },
): EmployeeCheckInSnapshot {
  return {
    active: null,
    customerPhone: "",
    error: null,
    identityGeneration: 1,
    locationId: "location-id",
    phase: "recognizing",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle,
  };
}

function render(
  locale: "en" | "ar",
  presentation: "camera" | "manual" | "descriptor",
  state = snapshot(),
) {
  return elements(
    NativeBusyStep({
      copy: getNativeCheckInCopy(locale),
      locale,
      onClose: vi.fn(),
      presentation,
      session: {} as EmployeeCheckInSession,
      snapshot: state,
      textAlign: locale === "ar" ? "right" : "left",
    }),
  );
}

describe("Issue #399 recognizing identity provenance", () => {
  it.each([
    ["en", "manual", "Manual Entry", "Entered plate · Jordan"],
    ["ar", "manual", "إدخال يدوي", "لوحة مدخلة · الأردن"],
    ["en", "camera", "Detected", "License Plate · Jordan"],
    ["ar", "camera", "تم الاكتشاف", "لوحة المركبة · الأردن"],
  ] as const)(
    "shows truthful %s %s wording while recognizing",
    (locale, presentation, status, context) => {
      const nodes = render(locale, presentation);
      const rendered = text(nodes).replace(/\s+/g, " ");
      expect(rendered).toContain(status);
      expect(rendered).toContain(context);
      expect(rendered).toContain("12-34567");
      expect(rendered).not.toMatch(/High confidence|ثقة عالية/i);
      if (presentation === "manual")
        expect(rendered).not.toMatch(/Detected|تم الاكتشاف/i);
    },
  );

  it.each(["en", "ar"] as const)(
    "keeps %s manually corrected plate as manual on return to capture",
    (locale) => {
      const corrected = snapshot({
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: "12-34568",
        temporaryDescriptor: "",
      });
      expect(
        initialCheckInCapturePresentation({ ...corrected, phase: "capture" }),
      ).toBe("manual");
      const rendered = text(render(locale, "manual", corrected));
      expect(rendered).toContain("12-34568");
      expect(rendered).not.toMatch(
        /Detected|تم الاكتشاف|confidence|ثقة عالية/i,
      );
    },
  );

  it.each(["en", "ar"] as const)(
    "keeps %s temporary descriptor free of camera provenance",
    (locale) => {
      const descriptor = snapshot({
        mode: "TEMPORARY_DESCRIPTOR",
        plateCountry: "JO",
        plateNumberRaw: "",
        temporaryDescriptor: "Silver SUV",
      });
      const rendered = text(render(locale, "descriptor", descriptor));
      expect(rendered).toContain("Silver SUV");
      expect(rendered).toContain(
        locale === "en" ? "Temporary Descriptor" : "وصف مؤقت",
      );
      expect(rendered).not.toMatch(
        /Detected|تم الاكتشاف|confidence|ثقة عالية|Entered plate|لوحة مدخلة/i,
      );
    },
  );
});
