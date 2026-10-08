import { describe, expect, it, vi } from "vitest";
import type { EmployeeHandoffSnapshot } from "@valet/employee-client";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("../src/appearance/employee-appearance-context", () => ({
  useEmployeeStyles: () => ({ card: {}, fieldLabel: {}, input: {}, pickupInput: {} }),
}));
vi.mock("../src/employee-ui/employee-controls", () => ({
  EmployeeButton: (props: Record<string, unknown>) => ({
    type: "EmployeeButton",
    props,
  }),
}));
vi.mock("../src/handoff/native-handoff-scanner", () => ({
  NativeHandoffScanner: () => null,
}));
vi.mock("../src/handoff/native-handoff-reason-action", () => ({
  NativeHandoffReasonAction: () => null,
}));

const { NativeHandoffPending } = await import("../src/handoff/native-handoff-pending");
const { getNativeHandoffCopy } = await import("../src/handoff/native-handoff-copy");
const { elements } = await import("./native-check-in-condition-test-support");

function render(locale: "ar" | "en", onGuestAccessRecovery?: () => void, busy = false) {
  const noop = () => {};
  const result = NativeHandoffPending({
    auth: {} as never,
    busy,
    copy: getNativeHandoffCopy(locale),
    handoff: { verifyPickupCode: noop, verifyDynamicQr: noop } as never,
    locale,
    onGuestAccessRecovery,
    snapshot: { failure: null, phase: "pending" } as EmployeeHandoffSnapshot,
    state: {
      abortReason: "",
      lastAction: null,
      overrideReason: "",
      pickupCode: "",
      qrProof: "",
      setAbortReason: noop,
      setLastAction: noop,
      setOverrideReason: noop,
      setPickupCode: noop,
      setQrProof: noop,
    },
    supervisor: false,
  });
  return elements(result).filter((node) => node.type === "EmployeeButton");
}

describe("T5 hidden-gated Native pending handoff Guest Access entry", () => {
  it.each(["en", "ar"] as const)("never shows the recovery entry without approved gate in %s", (locale) => {
    const controls = render(locale);
    expect(controls.some((node) => String(node.props.label).includes(locale === "en" ? "Guest Access" : "وصول الضيف"))).toBe(false);
  });

  it.each([
    ["en", "Guest Access"],
    ["ar", "وصول الضيف"],
  ] as const)("uses existing %s Native Guest Access copy and handler when gated on", (locale, label) => {
    const open = vi.fn();
    const controls = render(locale, open);
    const action = controls.find((node) => node.props.label === label);
    expect(action).toBeDefined();
    expect(action?.props.variant).toBe("secondary");
    expect(action?.props.size).toBe("standard");
    (action?.props.onPress as () => void)();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("disables recovery while another protected handoff mutation is busy", () => {
    const open = vi.fn();
    const action = render("en", open, true).find((node) => node.props.label === "Guest Access");
    expect(action?.props.disabled).toBe(true);
  });
});
