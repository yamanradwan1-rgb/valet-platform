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
  TextInput: "TextInput",
  View: "View",
}));

const { NativeCustomerStep } =
  await import("../src/check-in/native-check-in-input-steps");
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

function fixture(phone: string, locale: "en" | "ar" = "en") {
  const session = {
    setCustomerPhone: vi.fn(),
    submitCustomer: vi.fn(),
  } as unknown as EmployeeCheckInSession;
  const snapshot = {
    customerPhone: phone,
    error: null,
    phase: "customer",
    recognizedVehicle: null,
    vehicle: {
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "",
    },
  } as EmployeeCheckInSnapshot;
  const nodes = elements(
    NativeCustomerStep({
      copy: getNativeCheckInCopy(locale),
      session,
      snapshot,
      textAlign: locale === "ar" ? "right" : "left",
    }),
  );
  const continueButton = nodes.find(
    (node) =>
      node.type === "Pressable" &&
      node.props.accessibilityLabel ===
        (locale === "en" ? "Continue" : "متابعة"),
  )!;
  return { continueButton, nodes, session };
}

describe("Native Customer Contact Jordan phone validation", () => {
  it("keeps initial input quiet and Continue disabled", () => {
    const { continueButton, nodes } = fixture("");
    expect(continueButton.props.disabled).toBe(true);
    expect(
      nodes.some(
        (node) => node.props.children === "Enter a valid Jordan mobile number.",
      ),
    ).toBe(false);
    expect(nodes.some((node) => node.props.children === "🇯🇴  +962")).toBe(true);
    expect(
      nodes.find((node) => node.type === "TextInput")?.props,
    ).toMatchObject({
      placeholder: "79 000 0000",
    });
  });

  it("shows localized validation and blocks invalid submission", () => {
    const english = fixture("77896356");
    expect(english.continueButton.props.disabled).toBe(true);
    expect(
      english.nodes.some(
        (node) => node.props.children === "Enter a valid Jordan mobile number.",
      ),
    ).toBe(true);
    (english.continueButton.props.onPress as () => void)();
    expect(english.session.submitCustomer).not.toHaveBeenCalled();

    const arabic = fixture("77896356", "ar");
    expect(
      arabic.nodes.some(
        (node) => node.props.children === "أدخل رقم هاتف محمول أردني صالحًا.",
      ),
    ).toBe(true);
  });

  it("enables valid formatted input and uses the existing session action", () => {
    const context = fixture("79 000 0000");
    expect(context.continueButton.props.disabled).toBe(false);
    (context.continueButton.props.onPress as () => void)();
    expect(context.session.submitCustomer).toHaveBeenCalledOnce();
  });
});
