import { describe, expect, it, vi } from "vitest";
import { continuationForSession } from "@valet/employee-client";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeCheckInParkingTaskStep, nativeCheckInParkingTaskStyles } =
  await import("../src/check-in/native-check-in-parking-task-step");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");
const { conditionActive, content, elements, label, style } =
  await import("./native-check-in-condition-test-support");

function snapshot() {
  return {
    active: conditionActive,
    continuation: continuationForSession(conditionActive),
    customerPhone: "",
    error: null,
    identityGeneration: 1,
    locationId: conditionActive.locationId,
    phase: "continuation" as const,
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle: {
      mode: "CONFIRMED_PLATE" as const,
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "",
    },
  };
}

function render(locale: "en" | "ar" = "en", starting = false, error = false) {
  const onStart = vi.fn();
  const nodes = elements(
    NativeCheckInParkingTaskStep({
      copy: getNativeCheckInCopy(locale),
      error,
      onStart,
      snapshot: snapshot(),
      starting,
      textAlign: locale === "ar" ? "right" : "left",
    }),
  );
  return { nodes, onStart };
}

describe("UI-PARITY-08 Check-In Parking Task composition", () => {
  it.each([
    [
      "en",
      "Parking",
      "Location tracking will activate for this parking task",
      "Start Parking",
    ],
    ["ar", "الركن", "سيتم تفعيل تتبع الموقع لمهمة الركن هذه", "بدء الإيقاف"],
  ] as const)(
    "matches Web composition in %s",
    (locale, badge, notice, action) => {
      const { nodes, onStart } = render(locale);
      expect(content(nodes)).toContain(notice);
      expect(content(nodes)).toContain("Toyota Camry");
      expect(content(nodes)).toContain("12-34567");
      expect(
        nodes.find((node) => node.props.accessibilityLabel === badge),
      ).toBeDefined();
      expect(nativeCheckInParkingTaskStyles.notice).toMatchObject({
        backgroundColor: "#EDF4FF",
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
      });
      expect(nativeCheckInParkingTaskStyles.dot).toMatchObject({
        backgroundColor: "#176BFF",
        height: 6,
        width: 6,
      });
      const vehicle = nodes.find(
        (node) => node.props.children === "Toyota Camry",
      )!;
      expect(style(vehicle)).toMatchObject({ fontSize: 26 });
      const start = nodes.find(
        (node) => node.type === "Pressable" && label(node) === action,
      )!;
      (start.props.onPress as () => void)();
      expect(onStart).toHaveBeenCalledOnce();
    },
  );

  it("shows exact busy and failure states", () => {
    const busy = render("en", true).nodes;
    const action = busy.find(
      (node) =>
        node.type === "Pressable" && label(node) === "Starting Parking...",
    )!;
    expect(action.props.disabled).toBe(true);
    expect(action.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
    const failed = render("en", false, true).nodes;
    expect(content(failed)).toContain(
      "The operation failed. Refresh and try again.",
    );
  });
});
