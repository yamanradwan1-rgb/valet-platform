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

function render(state: EmployeeCheckInSnapshot, locale: "en" | "ar" = "en") {
  return elements(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose: vi.fn(),
      session: {
        cancelVehicleEdit: vi.fn(),
      } as unknown as Parameters<typeof NativeCheckInWorkflow>[0]["session"],
      snapshot: state,
    }),
  );
}

describe("MOB-011B Native completion continuation", () => {
  it("renders the canonical awaiting-parking continuation after completion", () => {
    const nodes = render(completedSnapshot());
    expect(
      nodes.filter(
        (node) =>
          node.props.accessibilityRole === "header" &&
          node.props.children === "Check-in complete",
      ),
    ).toHaveLength(1);
    expect(content(nodes)).toContain(
      "Check-in is complete on the server. The vehicle is now awaiting parking; continue the parking workflow in Employee Web.",
    );
    expect(content(nodes)).toContain("12-34567");
    expect(content(nodes)).not.toMatch(/Start Parking|بدء الاصطفاف/);
    expect(content(nodes)).not.toMatch(/parking spot|key slot|خانة/i);
  });

  it("renders the localized Arabic completion continuation", () => {
    const nodes = render(completedSnapshot(), "ar");
    expect(
      nodes.filter(
        (node) =>
          node.props.accessibilityRole === "header" &&
          node.props.children === "اكتمل تسجيل الوصول",
      ),
    ).toHaveLength(1);
    expect(content(nodes)).toContain(
      "اكتمل تسجيل الوصول على الخادم. المركبة بانتظار الاصطفاف الآن؛ تابع مسار الاصطفاف في تطبيق الموظف على الويب.",
    );
    expect(content(nodes)).not.toMatch(/Start Parking/);
  });

  it("keeps a restored continuation distinct from a fresh completion", () => {
    const restoredNodes = render(completedSnapshot("view"));
    expect(content(restoredNodes)).toContain(
      "This authoritative check-in is awaiting parking. Native parking parity is not implemented yet, and no state was changed locally.",
    );
    const completedNodes = render(completedSnapshot());
    expect(content(completedNodes)).toContain("Check-in complete");
    expect(content(restoredNodes)).not.toBe(content(completedNodes));
  });

  it("never renders a fabricated start-parking or key action at the boundary", () => {
    const nodes = render(completedSnapshot());
    const copy = content(nodes);
    expect(copy).not.toMatch(/Start Parking|بدء الاصطفاف/);
    expect(copy).not.toMatch(/key slot|خانة المفتاح/i);
  });
});
