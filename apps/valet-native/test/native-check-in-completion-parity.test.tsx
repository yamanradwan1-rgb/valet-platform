import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  emptyCheckInContinuation,
  type EmployeeCheckInSession,
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

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return elements((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...elements(node.props.children)];
}

const active = {
  conditionCompletedAt: null,
  sessionId: "session-id",
  state: "CHECKING_IN" as const,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
    vehicleId: "vehicle-id",
    vehicleUpdatedAt: "date",
  },
  version: 1,
};

function snapshot(
  patch: Partial<EmployeeCheckInSnapshot> = {},
): EmployeeCheckInSnapshot {
  return {
    active,
    continuation: {
      ...emptyCheckInContinuation(),
      conditionSelection: "No visible issue",
      mode: "select-condition",
    },
    customerPhone: "",
    error: null,
    identityGeneration: 1,
    locationId: "location",
    phase: "created",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle: {
      color: "Black",
      make: "Toyota",
      mode: "CONFIRMED_PLATE",
      model: "Camry",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "",
    },
    ...patch,
  };
}

function session() {
  return {
    continueVehicleDetails: vi.fn(),
    setConditionSelection: vi.fn(),
    setPreIntakeVehicleDetails: vi.fn(),
    submitConditionCompletion: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}

function render(state: EmployeeCheckInSnapshot, locale: "en" | "ar" = "en") {
  return elements(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose: vi.fn(),
      session: session(),
      snapshot: state,
    }),
  );
}

function spoken(nodes: Element[]): string {
  return nodes
    .flatMap((node) =>
      [node.props.children, node.props.accessibilityLabel].flat(),
    )
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

describe("UI-PARITY-08 Check-In sequence", () => {
  it.each([
    ["en", "Vehicle Condition", "No visible issue"],
    ["ar", "حالة المركبة", "لا توجد مشاكل ظاهرة"],
  ] as const)(
    "renders authoritative intake success directly as Condition in %s",
    (locale, title, selected) => {
      const nodes = render(snapshot(), locale);
      expect(
        nodes.some(
          (node) =>
            node.props.accessibilityRole === "header" &&
            node.props.children === title,
        ),
      ).toBe(true);
      expect(spoken(nodes)).toContain(selected);
      expect(spoken(nodes)).not.toMatch(
        /Continue in Employee Web|complete in Employee Web|Vehicle Condition is not implemented/i,
      );
    },
  );

  it("renders Web-ordered new-vehicle fields before customer submission", () => {
    const nodes = render(snapshot({ active: null, phase: "vehicle-details" }));
    const labels = nodes
      .filter((node) => node.type === "TextInput")
      .map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual(["Make", "Model", "Color"]);
    expect(spoken(nodes)).toContain("Skip vehicle details");
  });

  it("puts the no-plate description on Vehicle Details, not capture", () => {
    const nodes = render(
      snapshot({
        active: null,
        phase: "vehicle-details",
        vehicle: {
          mode: "TEMPORARY_DESCRIPTOR",
          plateCountry: "JO",
          plateNumberRaw: "",
          temporaryDescriptor: "",
        },
      }),
    );
    expect(
      nodes.find((node) => node.type === "TextInput")?.props.accessibilityLabel,
    ).toBe("Vehicle description");
  });
});
