import { describe, expect, it, vi } from "vitest";
import {
  continuationForSession,
  type EmployeeCheckInSnapshot,
  type NativeAuthSession,
} from "@valet/employee-client";

vi.mock("react", () => ({
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("../src/check-in/native-plate-camera-step", () => ({
  NativePlateCameraStep: "NativePlateCameraStep",
}));

const { NativeCheckInWorkflow } =
  await import("../src/check-in/native-check-in-workflow");
const { conditionActive, content, elements } =
  await import("./native-check-in-condition-test-support");

function completedSnapshot(
  mode: "condition-completed" | "view" = "condition-completed",
): EmployeeCheckInSnapshot {
  const active = {
    ...conditionActive,
    conditionCompletedAt: "2026-09-04T08:00:00.000Z",
    state: "AWAITING_PARKING" as const,
    version: 2,
  };
  return {
    active,
    continuation: { ...continuationForSession(active), mode },
    customerPhone: "",
    error: null,
    identityGeneration: 4,
    locationId: "location-id",
    phase: "continuation",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle: {
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "",
    },
  };
}

function render(
  state: EmployeeCheckInSnapshot,
  locale: "en" | "ar" = "en",
  onOpenParking = vi.fn(async () => true),
) {
  return elements(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose: vi.fn(),
      onOpenParking,
      session: {
        cancelVehicleEdit: vi.fn(),
      } as unknown as Parameters<typeof NativeCheckInWorkflow>[0]["session"],
      snapshot: state,
    }),
  );
}

describe("MOB-011B Native completion continuation", () => {
  it("renders the Web-equivalent Parking Task after completion", () => {
    const nodes = render(completedSnapshot());
    expect(
      nodes.filter(
        (node) =>
          node.props.accessibilityRole === "header" &&
          node.props.children === "Parking Task",
      ),
    ).toHaveLength(1);
    expect(content(nodes)).toContain(
      "Foreground location tracking may run only while this Parking movement is active",
    );
    expect(content(nodes)).toContain("12-34567");
    expect(content(nodes)).toContain("Start Parking");
    expect(content(nodes)).not.toMatch(/parking spot|key slot|خانة/i);
  });

  it("renders the localized Arabic completion continuation", () => {
    const nodes = render(completedSnapshot(), "ar");
    expect(
      nodes.filter(
        (node) =>
          node.props.accessibilityRole === "header" &&
          node.props.children === "مهمة الإيقاف",
      ),
    ).toHaveLength(1);
    expect(content(nodes)).toContain("قد يعمل تتبّع الموقع في الواجهة الأمامية فقط");
    expect(content(nodes)).toContain("بدء الإيقاف");
  });

  it("uses the same Parking Task composition for restored authority", () => {
    const restoredNodes = render(completedSnapshot("view"));
    expect(content(restoredNodes)).toContain("Start Parking");
    const completedNodes = render(completedSnapshot());
    expect(content(completedNodes)).toBe(content(restoredNodes));
  });

  it("renders no pre-parking key action", () => {
    const nodes = render(completedSnapshot());
    const copy = content(nodes);
    expect(copy).toContain("Start Parking");
    expect(copy).not.toMatch(/key slot|خانة المفتاح/i);
  });

  it("continues completed check-in into the canonical Parking Task workflow", () => {
    const onOpenParking = vi.fn(async () => true);
    const nodes = render(completedSnapshot(), "en", onOpenParking);
    const action = nodes.find(
      (node) => node.props.accessibilityLabel === "Start Parking",
    )!;
    (action.props.onPress as () => void)();
    expect(onOpenParking).toHaveBeenCalledWith(conditionActive.sessionId);
  });
});
