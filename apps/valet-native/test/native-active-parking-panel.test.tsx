import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useEffect: () => undefined,
  useState: (factory: () => unknown) => [factory(), vi.fn()],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeActiveParkingPanel } =
  await import("../src/parking/native-active-parking-panel");
const { nativeActiveParkingStyles } =
  await import("../src/parking/native-active-parking-styles");
const { content, elements } =
  await import("./native-check-in-condition-test-support");

const snapshot = {
  failure: null,
  identityGeneration: 7,
  phase: "started",
  scope: {},
  session: {
    keySlot: null,
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: "2026-09-09T10:00:00.000Z",
      parkingZoneCode: "A",
    },
    vehicle: {
      make: "Toyota",
      model: "Camry",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
  },
  task: {},
} as never;

describe("UI-PARITY-09 active Parking", () => {
  it.each([
    ["en", "Parking", "Park Vehicle"],
    ["ar", "الركن", "اركن المركبة"],
  ] as const)(
    "renders Web hierarchy and one explicit action in %s",
    (locale, heading, action) => {
      const onParkVehicle = vi.fn();
      const nodes = elements(
        NativeActiveParkingPanel({ locale, onParkVehicle, snapshot }),
      );
      expect(content(nodes)).toContain(heading);
      expect(content(nodes)).toContain("Toyota Camry");
      expect(content(nodes)).toContain("12-34567");
      expect(content(nodes)).toContain(
        locale === "ar" ? "الوقت المنقضي" : "Elapsed",
      );
      const button = nodes.find(
        (node) =>
          node.type === "Pressable" && node.props.accessibilityLabel === action,
      )!;
      (button.props.onPress as () => void)();
      expect(onParkVehicle).toHaveBeenCalledOnce();
      expect(content(nodes)).not.toContain("Report Issue");
    },
  );

  it("locks the material Web geometry", () => {
    expect(nativeActiveParkingStyles.body).toMatchObject({
      padding: 20,
      gap: 16,
    });
    expect(nativeActiveParkingStyles.elapsedCard).toMatchObject({
      padding: 20,
      borderRadius: 16,
      borderWidth: 1,
    });
  });
});
