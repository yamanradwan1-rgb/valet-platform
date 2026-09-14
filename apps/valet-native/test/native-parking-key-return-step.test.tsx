import { describe, expect, it, vi } from "vitest";

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

const { NativeParkingKeyReturnStep } =
  await import("../src/parking/native-parking-key-return-step");
const { getNativeParkingConfirmCopy } =
  await import("../src/parking/native-parking-confirm-copy");
const { nativeParkingConfirmStyles: s } =
  await import("../src/parking/native-parking-confirm-styles");
const { content, elements, label } =
  await import("./native-check-in-condition-test-support");

function render(
  locale: "en" | "ar" = "en",
  online = true,
  phase: "ready" | "slot" | "submitting" = "ready",
) {
  const confirmation = {
    confirmParked: vi.fn(),
    enterKeySlot: vi.fn(),
  };
  const nodes = elements(
    NativeParkingKeyReturnStep({
      auth: {} as never,
      confirmation: confirmation as never,
      copy: getNativeParkingConfirmCopy(locale),
      locale,
      online,
      snapshot: {
        conflict: null,
        failure: null,
        keySlotCandidate: phase === "slot" ? "" : "K-03",
        phase,
      } as never,
      textAlign: locale === "ar" ? "right" : "left",
    }),
  );
  return { confirmation, nodes };
}

describe("UI-PARITY-09 Key Return composition", () => {
  it.each([
    ["en", "Place the key into any available free slot", "Enter Key Slot Code"],
    ["ar", "ضع المفتاح في أي خانة فارغة متاحة", "أدخل رمز خانة المفتاح"],
  ] as const)(
    "matches Web info and manual input in %s",
    (locale, info, placeholder) => {
      const { confirmation, nodes } = render(locale);
      expect(content(nodes)).toContain(info);
      expect(
        nodes.find((node) => node.type === "QrInput")?.props,
      ).toMatchObject({
        autoOpen: true,
        kind: "key-slot",
        manualInput: false,
      });
      const input = nodes.find((node) => node.type === "TextInput")!;
      expect(input.props).toMatchObject({ placeholder, value: "K-03" });
      expect(s.keyInput).toMatchObject({
        fontSize: 20,
        fontWeight: "600",
        height: 48,
        textAlign: "center",
        writingDirection: "ltr",
      });
      (input.props.onChangeText as (value: string) => void)("K-04");
      expect(confirmation.enterKeySlot).toHaveBeenCalledWith("K-04");
      expect(confirmation.confirmParked).not.toHaveBeenCalled();
      const qr = nodes.find((node) => node.type === "QrInput")!;
      (qr.props.onChange as (value: string) => void)("K-05");
      expect(confirmation.enterKeySlot).toHaveBeenLastCalledWith("K-05");
      expect(confirmation.confirmParked).not.toHaveBeenCalled();
      expect(s.keyInfoPanel).toMatchObject({
        backgroundColor: "#EDF4FF",
        borderRadius: 12,
        padding: 16,
      });
    },
  );

  it("uses an explicit green action and blocks it offline", () => {
    const online = render();
    const confirm = online.nodes.find(
      (node) => node.type === "Pressable" && label(node) === "Confirm Parked",
    )!;
    const visual = (
      confirm.props.style as (state: { pressed: boolean }) => unknown
    )({
      pressed: false,
    });
    expect(visual).toContainEqual({ backgroundColor: "#2F9B78" });
    (confirm.props.onPress as () => void)();
    expect(online.confirmation.confirmParked).toHaveBeenCalledOnce();

    const offline = render("en", false);
    expect(content(offline.nodes)).toContain(
      "No network connection. Reconnect to refresh and continue.",
    );
    expect(s.offlinePanel).toMatchObject({
      backgroundColor: "#EDF4FF",
      paddingVertical: 12,
    });
    expect(s.dangerDot.backgroundColor).toBe("#D95C63");
    const blocked = offline.nodes.find(
      (node) => node.type === "Pressable" && label(node) === "Confirm Parked",
    )!;
    expect(blocked.props.disabled).toBe(true);
  });

  it("keeps manual input visible and the action busy during submission", () => {
    const { nodes } = render("en", true, "submitting");
    expect(nodes.some((node) => node.type === "TextInput")).toBe(true);
    const action = nodes.find(
      (node) => node.type === "Pressable" && label(node) === "Confirming...",
    )!;
    expect(action.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });
});
