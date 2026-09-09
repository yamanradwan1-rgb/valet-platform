import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInRecoverable,
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

vi.mock("react", () => ({
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [initial, vi.fn()],
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
function style(node: Element): Record<string, unknown> {
  return Object.assign(
    {},
    ...[node.props.style].flat(Infinity).filter(Boolean),
  );
}
const vehicle = {
  color: null,
  make: "Toyota",
  model: "Camry",
  plateCountry: "JO",
  plateNumberRaw: "12-34567",
  temporaryDescriptor: null,
};
const draft = {
  kind: "DRAFT",
  value: {
    conditionCompletedAt: null,
    createdAt: "date",
    sessionId: "draft-session",
    vehicle,
  },
} as const satisfies EmployeeCheckInRecoverable;
const continuation = {
  kind: "CONTINUATION",
  value: {
    conditionCompletedAt: "date",
    createdAt: "date",
    sessionId: "continuation-session",
    state: "AWAITING_PARKING",
    vehicle: { ...vehicle, plateNumberRaw: "98-76543" },
  },
} as const satisfies EmployeeCheckInRecoverable;

describe("MOB-010 Patch 4 recoverables presentation", () => {
  it("uses contextual hierarchy, semantic badges, and exact explicit resume", () => {
    const session = { resume: vi.fn() } as unknown as EmployeeCheckInSession;
    const snapshot: EmployeeCheckInSnapshot = {
      active: null,
      customerPhone: "",
      error: null,
      identityGeneration: null,
      locationId: "location",
      phase: "recoverables",
      recognizedVehicle: null,
      recoverables: [draft, continuation],
      recoveryChecked: false,
      vehicle: {
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: "",
        temporaryDescriptor: "",
      },
    };
    const onClose = vi.fn();
    const nodes = elements(
      NativeCheckInWorkflow({
        auth: {} as NativeAuthSession,
        locale: "en",
        onClose,
        session,
        snapshot,
      }),
    );
    expect(
      nodes.filter(
        (node) =>
          node.props.accessibilityRole === "header" &&
          node.props.children === "Recoverable Sessions",
      ),
    ).toHaveLength(1);
    expect(
      nodes.some(
        (node) => node.props.children === "Multiple Incomplete Check-Ins Found",
      ),
    ).toBe(true);
    expect(
      style(nodes.find((node) => node.props.accessibilityLabel === "Draft")!),
    ).toMatchObject({ backgroundColor: "#EDF4FF" });
    expect(
      style(nodes.find((node) => node.props.children === "Draft")!),
    ).toMatchObject({ color: "#176BFF" });
    expect(
      style(
        nodes.find(
          (node) => node.props.accessibilityLabel === "Awaiting parking",
        )!,
      ),
    ).toMatchObject({ backgroundColor: "#EEFBF5" });
    expect(
      style(nodes.find((node) => node.props.children === "Awaiting parking")!),
    ).toMatchObject({ color: "#2F9B78" });
    const cards = nodes.filter(
      (node) =>
        node.type === "Pressable" &&
        typeof node.props.accessibilityLabel === "string" &&
        node.props.accessibilityLabel !== "Back",
    );
    expect(cards).toHaveLength(2);
    expect(
      cards.every((card) => card.props.accessibilityRole === "button"),
    ).toBe(true);
    expect(session.resume).not.toHaveBeenCalled();
    (cards[0]!.props.onPress as () => void)();
    (cards[1]!.props.onPress as () => void)();
    expect(session.resume).toHaveBeenNthCalledWith(1, draft);
    expect(session.resume).toHaveBeenNthCalledWith(2, continuation);
    expect(
      nodes.some((node) => node.props.accessibilityLabel === "Start New"),
    ).toBe(false);
    const back = nodes.find(
      (node) => node.props.accessibilityLabel === "Back",
    )!;
    expect(back.props.disabled).toBe(false);
    (back.props.onPress as () => void)();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
