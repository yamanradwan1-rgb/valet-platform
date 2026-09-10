import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  continuationForSession,
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
    vehicleUpdatedAt: "2026-09-04T08:00:00.000Z",
  },
};

function snapshot(
  mode: EmployeeCheckInSnapshot["continuation"]["mode"] = "view",
): EmployeeCheckInSnapshot {
  return {
    active,
    continuation: { ...continuationForSession(active, mode), mode },
    customerPhone: "",
    error: null,
    identityGeneration: 4,
    locationId: "location-id",
    phase: "created",
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

function session() {
  return {
    cancelVehicleEdit: vi.fn(),
    continueVehicleIntake: vi.fn(),
    editVehicleDetails: vi.fn(),
    editVehicleIdentity: vi.fn(),
    retryCorrectionRecovery: vi.fn(),
    reviewVehicleIdentity: vi.fn(),
    setVehicleDetails: vi.fn(),
    setVehicleIdentity: vi.fn(),
    submitIdentityCorrection: vi.fn(),
    submitVehicleDetails: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}

function render(state: EmployeeCheckInSnapshot, locale: "en" | "ar" = "en") {
  const checkIn = session();
  const onClose = vi.fn();
  const nodes = elements(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose,
      session: checkIn,
      snapshot: state,
    }),
  );
  return { checkIn, nodes, onClose };
}

function spoken(nodes: Element[]): string {
  return nodes
    .flatMap((node) =>
      [node.props.children, node.props.accessibilityLabel].flat(),
    )
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

describe("MOB-011A Native vehicle continuation", () => {
  it.each([
    ["en", "Vehicle details", "Vehicle", "Correct vehicle details"],
    ["ar", "تفاصيل المركبة", "المركبة", "تصحيح بيانات المركبة"],
  ] as const)(
    "presents authoritative %s hierarchy",
    (locale, title, badge, edit) => {
      const { nodes } = render(snapshot(), locale);
      expect(
        nodes.some(
          (node) =>
            node.props.accessibilityRole === "header" &&
            node.props.children === title,
        ),
      ).toBe(true);
      expect(spoken(nodes)).toContain(badge);
      expect(spoken(nodes)).toContain(edit);
      expect(
        nodes.find((node) => node.type === "ScrollView")?.props
          .contentContainerStyle,
      ).toContainEqual({ direction: locale === "ar" ? "rtl" : "ltr" });
    },
  );

  it("renders accessible detail fields and exact save action", () => {
    const state = snapshot("edit-details");
    const { checkIn, nodes } = render(state);
    for (const label of ["Make", "Model", "Color"]) {
      expect(
        nodes.some(
          (node) =>
            node.type === "TextInput" &&
            node.props.accessibilityLabel === label,
        ),
      ).toBe(true);
    }
    const save = nodes.find(
      (node) =>
        node.type === "Pressable" &&
        node.props.accessibilityLabel === "Confirm",
    )!;
    (save.props.onPress as () => void)();
    expect(checkIn.submitVehicleDetails).toHaveBeenCalledOnce();
  });

  it("keeps Arabic plate input in an LTR identifier island", () => {
    const { nodes } = render(snapshot("edit-identity"), "ar");
    const plate = nodes.find(
      (node) =>
        node.type === "TextInput" &&
        node.props.accessibilityLabel === "لوحة المركبة",
    )!;
    expect([plate.props.style].flat(Infinity)).toContainEqual(
      expect.objectContaining({ textAlign: "left", writingDirection: "ltr" }),
    );
  });

  it("surfaces a definitive plate conflict on the confirmation step", () => {
    const state = snapshot("confirm-identity");
    const { nodes } = render({
      ...state,
      error: {
        code: "VEHICLE_IDENTITY_CONFLICT",
        message: "Conflict",
        status: 409,
      },
    });
    expect(spoken(nodes)).toContain(
      "The operation failed. Refresh and try again.",
    );
  });

  it("uses local Back for an edit and never closes authoritative context", () => {
    const { checkIn, nodes, onClose } = render(snapshot("edit-details"));
    const back = nodes.find(
      (node) =>
        node.type === "Pressable" && node.props.accessibilityLabel === "Back",
    )!;
    (back.props.onPress as () => void)();
    expect(checkIn.cancelVehicleEdit).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(["submitting", "reconciling", "ambiguous"] as const)(
    "disables Back while correction mode is %s",
    (mode) => {
      const { nodes } = render(snapshot(mode));
      const back = nodes.find(
        (node) =>
          node.type === "Pressable" && node.props.accessibilityLabel === "Back",
      )!;
      expect(back.props.disabled).toBe(true);
    },
  );

  it("offers read-only recovery after an ambiguous correction", () => {
    const state = snapshot("ambiguous");
    const { checkIn, nodes } = render({
      ...state,
      continuation: {
        ...state.continuation,
        pendingIntent: {
          kind: "DETAILS",
          request: {
            color: "Blue",
            expectedVehicleUpdatedAt: active.vehicle.vehicleUpdatedAt,
            make: "Toyota",
            model: "Camry",
          },
        },
      },
    });
    const check = nodes.find(
      (node) =>
        node.type === "Pressable" && node.props.accessibilityLabel === "Retry",
    )!;
    (check.props.onPress as () => void)();
    expect(checkIn.retryCorrectionRecovery).toHaveBeenCalledOnce();
  });
});
