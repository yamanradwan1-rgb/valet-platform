import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const theme = vi.hoisted(() => ({ mode: "light" as "light" | "dark" }));
vi.mock("react", () => ({
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeePalettes } =
    await import("../src/appearance/employee-palette");
  return {
    useEmployeeStyles: (styles: Record<string, unknown>) => styles[theme.mode],
    useEmployeePalette: () => employeePalettes[theme.mode],
  };
});
vi.mock("../src/parking/native-parking-qr-input", () => ({
  NativeParkingQrInput: (props: unknown) => ({ type: "QrInput", props }),
}));
vi.mock("../src/employee-ui/employee-icons", () => ({
  EmployeeBackIcon: () => ({ type: "BackIcon", props: {} }),
  EmployeeBigCheckIcon: () => ({ type: "BigCheck", props: {} }),
}));

const { NativeParkingSpotStep } =
  await import("../src/parking/native-parking-spot-step");
const { getNativeParkingConfirmCopy } =
  await import("../src/parking/native-parking-confirm-copy");
const { elements, content, style } =
  await import("./native-check-in-condition-test-support");

describe("#264 frozen Native validation presentation", () => {
  it("fences pending validation before leaving the Spot screen", async () => {
    const { NativeParkingConfirmPanel } =
      await import("../src/parking/native-parking-confirm-panel");
    const order: string[] = [];
    const nodes = elements(
      NativeParkingConfirmPanel({
        auth: {} as never,
        locale: "en",
        onDone: vi.fn(),
        onBack: () => order.push("leave"),
        confirmation: { backToSpot: () => order.push("invalidate") } as never,
        snapshot: {
          phase: "spot",
          parkingSpotCandidate: "14",
          parkingSpotValidationPending: true,
          conflict: null,
          failure: null,
          session: null,
        } as never,
      }),
    );
    const back = nodes.find(
      (node) =>
        node.type === "Pressable" && node.props.accessibilityLabel === "Back",
    )!;
    expect(back.props.disabled).toBe(false);
    (back.props.onPress as () => void)();
    expect(order).toEqual(["invalidate", "leave"]);
  });
  it.each([
    ["en", "left", "light"],
    ["en", "left", "dark"],
    ["ar", "right", "light"],
    ["ar", "right", "dark"],
  ] as const)(
    "%s %s %s exposes busy, correction, retry and non-color failure",
    (locale, textAlign, mode) => {
      theme.mode = mode;
      const copy = getNativeParkingConfirmCopy(locale);
      const confirmation = {
        enterParkingSpot: vi.fn(),
        continueToKeySlot: vi.fn(),
        confirmParked: vi.fn(),
      };
      const render = (pending: boolean, failure: boolean) =>
        elements(
          NativeParkingSpotStep({
            auth: {} as never,
            confirmation: confirmation as never,
            copy,
            locale,
            textAlign,
            snapshot: {
              parkingSpotCandidate: "14",
              parkingSpotValidationPending: pending,
              conflict: failure ? "spot" : null,
              failure: null,
              session: { parking: { parkingZoneCode: "A" } },
            } as never,
          }),
        );
      const busy = render(true, false);
      const button = busy.find(
        (node) =>
          node.type === "Pressable" &&
          node.props.accessibilityLabel === copy.validatingSpot,
      )!;
      expect(button.props).toMatchObject({
        disabled: true,
        accessibilityState: { busy: true, disabled: true },
      });
      expect(busy.some((node) => node.type === "ActivityIndicator")).toBe(true);
      const failed = render(false, true);
      const alert = failed.find(
        (node) => node.props.accessibilityRole === "alert",
      )!;
      expect(alert.props.accessibilityLiveRegion).toBe("assertive");
      expect(content(elements(alert))).toContain(copy.spotConflict);
      expect(content(elements(alert))).toContain(copy.parkingSpot);
      const errorText = failed.find(
        (node) =>
          node.type === "Text" && content([node]).includes(copy.spotConflict),
      )!;
      expect(style(errorText).textAlign).toBe(textAlign);
      const input = failed.find((node) => node.type === "TextInput")!;
      expect(input.props.accessibilityLabel).toBe(copy.spotCode);
      expect(input.props.editable).not.toBe(false);
      (input.props.onChangeText as (value: string) => void)("15");
      expect(confirmation.enterParkingSpot).toHaveBeenCalledWith("15");
      const scan = failed.find(
        (node) =>
          node.type === "Pressable" &&
          node.props.accessibilityLabel === copy.scanAgain,
      )!;
      expect(scan.props.disabled).toBe(false);
      (scan.props.onPress as () => void)();
      expect(confirmation.enterParkingSpot).toHaveBeenLastCalledWith("");
      expect(confirmation.confirmParked).not.toHaveBeenCalled();
      expect(copy.validationRetry).toBeTruthy();
      expect(copy.validatingSpot).toBeTruthy();
      if (locale === "ar")
        expect(copy.validationRetry).toMatch(/[\u0600-\u06ff]/);
    },
  );

  it("keeps focus and theme decisions in existing presentation boundaries", () => {
    const source = readFileSync(
      new URL("../src/parking/native-parking-spot-step.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /\.focus\(|autoFocus|setAccessibilityFocus|StyleSheet|useEffect/,
    );
    expect(source).toContain("<EmployeeErrorNotice");
    expect(source).toContain("<NativeParkingResourceResult");
    expect(source).toContain('variant="success"');
    expect(source).toContain('variant="secondary"');
  });
});
