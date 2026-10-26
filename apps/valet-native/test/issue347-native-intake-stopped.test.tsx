import type { ReactElement } from "react";
import { expect, it, vi } from "vitest";
import { resolveAppearanceTree } from "./appearance-render-tree";
import {
  base,
  controller,
  recognized,
} from "./native-check-in-locale-state-fixtures";
import { employeePalettes } from "../src/appearance/employee-palette";

const appearance = vi.hoisted(() => ({ mode: "light" as "light" | "dark" }));
vi.mock("../src/appearance/employee-appearance-context", () => ({
  useEmployeeStyles: (styles: Record<string, unknown>) =>
    styles[appearance.mode],
  useEmployeePalette: () => employeePalettes[appearance.mode],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));
const { NativeCustomerStep } =
  await import("../src/check-in/native-check-in-input-steps");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");
const { checkInFailureMessage } =
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

const approved = {
  en: "This location is not accepting new vehicles right now. Contact the location manager.",
  ar: "هذا الفرع لا يستقبل سيارات جديدة حاليًا. تواصل مع إدارة الفرع.",
};
for (const locale of ["en", "ar"] as const)
  for (const mode of ["light", "dark"] as const) {
    it(`reuses unchanged Customer Contact controls and one localized announcement in ${locale}/${mode}`, () => {
      appearance.mode = mode;
      const session = controller();
      const copy = getNativeCheckInCopy(locale);
      const textAlign = locale === "ar" ? "right" : "left";
      const render = (code: string) =>
        elements(
          NativeCustomerStep({
            copy,
            session,
            textAlign,
            snapshot: base({
              phase: "customer",
              recognizedVehicle: recognized,
              customerPhone: "79 000 0000",
              error: { code, message: "Server wording is not UI copy" },
            }),
          }),
        );
      const nodes = render("LOCATION_INTAKE_STOPPED");
      const existing = render("AUTHORIZATION_DENIED");
      const alert = nodes.filter(
        (node) => node.props.accessibilityLiveRegion === "assertive",
      );
      expect(alert).toHaveLength(1);
      expect(alert[0]!.props.children).toBe(approved[locale]);
      expect(
        Object.assign({}, ...(alert[0]!.props.style as object[]))
          .backgroundColor,
      ).toBe(employeePalettes[mode].errorSurface);
      expect(alert[0]!.props.style).toEqual(
        existing.find(
          (node) => node.props.accessibilityLiveRegion === "assertive",
        )!.props.style,
      );
      expect(alert[0]!.props.style).toContainEqual({
        textAlign,
        writingDirection: locale === "ar" ? "rtl" : "ltr",
      });
      const controls = nodes.filter((node) =>
        ["Pressable", "TextInput"].includes(node.type as string),
      );
      const oldControls = existing.filter((node) =>
        ["Pressable", "TextInput"].includes(node.type as string),
      );
      expect(controls.map((node) => resolveAppearanceTree(node))).toEqual(
        oldControls.map((node) => resolveAppearanceTree(node)),
      );
      const input = controls.find((node) => node.type === "TextInput")!;
      expect(input.props.value).toBe("79 000 0000");
      const next = nodes.find(
        (node) => node.props.accessibilityLabel === copy.continueLabel,
      )!;
      expect(nodes.indexOf(alert[0]!)).toBeLessThan(nodes.indexOf(next));
      expect(next.props.disabled).toBe(false);
      expect(session.submitCustomer).not.toHaveBeenCalled();
      expect(session.setCustomerPhone).not.toHaveBeenCalled();
      expect(session.retryIntake).not.toHaveBeenCalled();
      (next.props.onPress as () => void)();
      expect(session.submitCustomer).toHaveBeenCalledTimes(1);
      expect(
        checkInFailureMessage(copy, {
          code: "NETWORK_ERROR",
          message: "network",
        }),
      ).toBe(copy.intakeUnknown);
      expect(
        checkInFailureMessage(copy, {
          code: "AUTHORIZATION_DENIED",
          message: "denied",
        }),
      ).toBe(copy.discoveryError);
      expect(checkInFailureMessage(copy, null)).toBeNull();
    });
  }
