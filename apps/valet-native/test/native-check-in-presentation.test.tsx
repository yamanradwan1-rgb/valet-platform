import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";
vi.mock("react", () => ({
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (init: unknown) => [
    typeof init === "function" ? (init as () => unknown)() : init,
    vi.fn(),
  ],
}));
vi.mock("../src/check-in/native-plate-camera-step", () => ({
  NativePlateCameraStep: "NativePlateCameraStep",
}));
const auth = {} as NativeAuthSession;

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));

const { NativeCheckInWorkflow } =
  await import("../src/check-in/native-check-in-workflow");

type Element = ReactElement<Record<string, unknown>>;

function expand(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(expand);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function") {
    return expand((node.type as (props: unknown) => unknown)(node.props));
  }
  return [node, ...expand(node.props.children)];
}

function snapshot(
  patch: Partial<EmployeeCheckInSnapshot> = {},
): EmployeeCheckInSnapshot {
  return {
    active: null,
    customerPhone: "",
    error: null,
    identityGeneration: 1,
    locationId: "11111111-1111-4111-8111-111111111111",
    phase: "capture",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle: {
      mode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: "",
    },
    ...patch,
  };
}

function session() {
  return {
    activate: vi.fn(),
    chooseDifferentCustomer: vi.fn(),
    clear: vi.fn(),
    confirmIdentity: vi.fn(),
    continueWithoutRecognition: vi.fn(),
    editIdentity: vi.fn(),
    recoverAmbiguous: vi.fn(),
    resume: vi.fn(),
    retryDiscovery: vi.fn(),
    retryIntake: vi.fn(),
    reviewIdentity: vi.fn(),
    setCustomerPhone: vi.fn(),
    setVehicle: vi.fn(),
    startNew: vi.fn(),
    submitCustomer: vi.fn(),
    useSavedCustomer: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}

function render(
  state: EmployeeCheckInSnapshot,
  locale: "en" | "ar" = "en",
  controller = session(),
) {
  const tree = NativeCheckInWorkflow({
    auth,
    locale,
    onClose: vi.fn(),
    session: controller,
    snapshot: state,
  });
  return { controller, nodes: expand(tree) };
}

function labels(nodes: Element[]) {
  return nodes
    .map((node) => node.props.accessibilityLabel)
    .filter((value): value is string => typeof value === "string");
}

describe("Native Check-In presentation", () => {
  it("keeps the known-plate common path focused on manual identity confirmation", () => {
    const { nodes } = render(snapshot());
    expect(labels(nodes)).toEqual(
      expect.arrayContaining([
        "Back",
        "Country / Region: Jordan (JO)",
        "No / unreadable plate",
        "License Plate",
        "Continue",
      ]),
    );
    expect(labels(nodes)).not.toContain("Mobile number");
    expect(nodes.filter((node) => node.type === "TextInput")).toHaveLength(1);
    expect(nodes.some((node) => node.props.accessibilityRole === "tab")).toBe(
      false,
    );
  });

  it("shows descriptor-only manual fallback for a no-plate vehicle", () => {
    const state = snapshot({
      vehicle: {
        mode: "TEMPORARY_DESCRIPTOR",
        plateCountry: "JO",
        plateNumberRaw: "",
        temporaryDescriptor: "Silver Toyota SUV",
      },
    });
    const { nodes } = render(state);
    expect(labels(nodes)).toContain("Vehicle description");
    expect(labels(nodes)).not.toContain("License plate");
    expect(nodes.filter((node) => node.type === "TextInput")).toHaveLength(1);
  });

  it("presents a returning Customer only as a masked previous association", () => {
    const controller = session();
    const customerId = "44444444-4444-4444-8444-444444444444";
    const { nodes } = render(
      snapshot({
        phase: "returning",
        recognizedVehicle: {
          color: "Black",
          make: "Toyota",
          model: "Camry",
          plateCountry: "JO",
          plateNumberNormalized: "1234567",
          plateNumberRaw: "12-34567",
          returningCustomer: {
            customerId,
            displayName: "A. Customer",
            phoneSuffix: "1234",
          },
          vehicleId: "33333333-3333-4333-8333-333333333333",
          vehicleUpdatedAt: "2026-09-04T08:00:00.000Z",
        },
      }),
      "en",
      controller,
    );
    const content = nodes
      .map((node) => node.props.children)
      .flat()
      .join(" ");
    expect(content).toContain("Previously");
    expect(content).toContain("1234");
    expect(content).not.toContain(customerId);
    const useSaved = nodes.find(
      (node) => node.props.accessibilityLabel === "Use saved customer",
    )!;
    const different = nodes.find(
      (node) => node.props.accessibilityLabel === "Different customer",
    )!;
    (useSaved.props.onPress as () => void)();
    (different.props.onPress as () => void)();
    expect(controller.useSavedCustomer).toHaveBeenCalledOnce();
    expect(controller.chooseDifferentCustomer).toHaveBeenCalledOnce();
  });

  it("does not invent a Customer suggestion when exact recognition has none", () => {
    const { nodes } = render(
      snapshot({
        phase: "returning",
        recognizedVehicle: {
          color: null,
          make: null,
          model: null,
          plateCountry: "JO",
          plateNumberNormalized: "1234567",
          plateNumberRaw: "12-34567",
          returningCustomer: null,
          vehicleId: "33333333-3333-4333-8333-333333333333",
          vehicleUpdatedAt: "2026-09-04T08:00:00.000Z",
        },
      }),
    );
    expect(labels(nodes)).not.toContain("Use saved customer");
    expect(labels(nodes)).toContain("Continue");
  });

  it("shows truthful loading, validation, and rehydrate-before-retry states", () => {
    expect(
      expand(
        NativeCheckInWorkflow({
          auth,
          locale: "en",
          onClose: vi.fn(),
          session: session(),
          snapshot: snapshot({ phase: "discovering" }),
        }),
      ).some((node) => node.props.children === "Checking saved check-ins…"),
    ).toBe(true);
    const invalid = render(
      snapshot({
        error: { code: "PLATE_REQUIRED", message: "required" },
      }),
    );
    expect(
      invalid.nodes.some((node) => node.props.children === "Enter Plate"),
    ).toBe(true);
    const first = render(snapshot({ phase: "intake-ambiguous" }));
    expect(labels(first.nodes)).toContain("Check server state");
    expect(labels(first.nodes)).not.toContain("Retry same check-in");
    const checked = render(
      snapshot({ phase: "intake-ambiguous", recoveryChecked: true }),
    );
    expect(labels(checked.nodes)).toContain("Retry same check-in");
  });

  it("uses Arabic flow direction while keeping identifiers LTR", () => {
    const { nodes } = render(snapshot(), "ar");
    const scroll = nodes.find((node) => node.type === "ScrollView")!;
    expect(scroll.props.contentContainerStyle).toContainEqual({
      direction: "rtl",
    });
    for (const input of nodes.filter((node) => node.type === "TextInput")) {
      expect(input.props.style).toContainEqual({
        textAlign: "center",
        writingDirection: "ltr",
      });
    }
    expect(labels(nodes)).toContain("لوحة المركبة");
  });
});
