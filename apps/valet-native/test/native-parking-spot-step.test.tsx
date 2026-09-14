import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("../src/parking/native-parking-qr-input", () => ({
  NativeParkingQrInput: (props: unknown) => ({ type: "QrInput", props }),
}));

const { NativeParkingSpotStep } =
  await import("../src/parking/native-parking-spot-step");
const { getNativeParkingConfirmCopy } =
  await import("../src/parking/native-parking-confirm-copy");
const { nativeParkingConfirmStyles } =
  await import("../src/parking/native-parking-confirm-styles");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return elements((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...elements(node.props.children)];
}

function render(candidate: string) {
  const confirmation = {
    confirmParked: vi.fn(),
    continueToKeySlot: vi.fn(),
    enterParkingSpot: vi.fn(),
  };
  const nodes = elements(
    NativeParkingSpotStep({
      auth: {} as never,
      confirmation: confirmation as never,
      copy: getNativeParkingConfirmCopy("en"),
      locale: "en",
      snapshot: {
        conflict: null,
        parkingSpotCandidate: candidate,
        session: { parking: { parkingZoneCode: "A" } },
      } as never,
      textAlign: "left",
    }),
  );
  const action = (label: string) =>
    nodes.find(
      (node) =>
        node.type === "Pressable" && node.props.accessibilityLabel === label,
    )!;
  return { action, confirmation, nodes };
}

describe("Parking Spot scanner/manual composition", () => {
  it("starts scanner-first with a separate manual action", () => {
    const { nodes } = render("");
    expect(nodes.find((node) => node.type === "QrInput")?.props).toMatchObject({
      autoOpen: true,
      manualInput: false,
      value: "",
    });
    expect(
      nodes.some(
        (node) =>
          node.type === "Pressable" &&
          node.props.accessibilityLabel === "Enter spot code manually",
      ),
    ).toBe(true);
    expect(nodes.some((node) => node.type === "TextInput")).toBe(false);
  });

  it("keeps a scanned/manual candidate editable before draft continuation", () => {
    const { action, confirmation, nodes } = render("P-101");
    const input = nodes.find(
      (node) =>
        node.type === "TextInput" &&
        node.props.accessibilityLabel === "Spot Code",
    )!;
    expect(input.props.value).toBe("P-101");
    expect(input.props.placeholder).toBe("Enter spot code");
    expect(nativeParkingConfirmStyles.spotInput).toMatchObject({
      fontSize: 20,
      height: 48,
      writingDirection: "ltr",
    });
    (input.props.onChangeText as (value: string) => void)("P-102");
    expect(confirmation.enterParkingSpot).toHaveBeenCalledWith("P-102");
    (action("Continue").props.onPress as () => void)();
    expect(confirmation.continueToKeySlot).toHaveBeenCalledOnce();
    expect(confirmation.confirmParked).not.toHaveBeenCalled();
    (action("Scan again").props.onPress as () => void)();
    expect(confirmation.enterParkingSpot).toHaveBeenLastCalledWith("");
  });
});
