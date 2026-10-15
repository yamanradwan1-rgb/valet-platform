import type { ReactElement } from "react";
import "./native-condition-photo-test-boundary";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  NativeAuthSession,
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
function style(node: Element): Record<string, unknown> {
  const value =
    typeof node.props.style === "function"
      ? (node.props.style as (state: { pressed: boolean }) => unknown)({
          pressed: false,
        })
      : node.props.style;
  return Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
}
function snapshot(
  patch: Partial<EmployeeCheckInSnapshot>,
): EmployeeCheckInSnapshot {
  return {
    active: null,
    customerPhone: "790001234",
    error: null,
    identityGeneration: 1,
    locationId: "location",
    phase: "returning",
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
const recognized = {
  color: "Black",
  make: "Toyota",
  model: "Camry",
  plateCountry: "JO",
  plateNumberNormalized: "1234567",
  plateNumberRaw: "12-34567",
  returningCustomer: {
    customerId: "customer-id",
    displayName: "A. Customer",
    phoneSuffix: "1234",
  },
  vehicleId: "vehicle-id",
  vehicleUpdatedAt: "2026-09-04T08:00:00.000Z",
} as const;
function controller() {
  return {
    chooseDifferentCustomer: vi.fn(),
    resume: vi.fn(),
    setCustomerPhone: vi.fn(),
    setReturningVehicleCorrection: vi.fn(),
    submitCustomer: vi.fn(),
    useSavedCustomer: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}
function render(
  state: EmployeeCheckInSnapshot,
  locale: "en" | "ar" = "en",
  session = controller(),
) {
  return {
    nodes: elements(
      NativeCheckInWorkflow({
        auth: {} as NativeAuthSession,
        locale,
        onClose: vi.fn(),
        session,
        snapshot: state,
      }),
    ),
    session,
  };
}
function action(nodes: Element[], label: string) {
  return nodes.find((node) => node.props.accessibilityLabel === label)!;
}

describe("MOB-010 Patch 4 returning and customer presentation", () => {
  it("uses one contextual header and compact explicit saved-Customer actions", () => {
    const session = controller();
    const { nodes } = render(
      snapshot({ recognizedVehicle: recognized }),
      "en",
      session,
    );
    expect(
      nodes.filter(
        (node) =>
          node.props.accessibilityRole === "header" &&
          node.props.children === "Vehicle found",
      ),
    ).toHaveLength(1);
    expect(
      nodes.some(
        (node) => node.props.accessibilityLabel === "Toyota Camry, 12-34567",
      ),
    ).toBe(true);
    expect(nodes.some((node) => node.props.children === "A. Customer")).toBe(
      true,
    );
    const suffix = nodes.find((node) => node.props.children === "1234")!;
    expect(style(suffix)).toMatchObject({ writingDirection: "ltr" });
    const allLabels = nodes
      .map((node) => node.props.accessibilityLabel)
      .filter((label): label is string => typeof label === "string")
      .join(" ");
    expect(allLabels).toContain("Phone ending 1234");
    expect(allLabels).not.toContain("+962790001234");
    const saved = action(nodes, "Use saved customer");
    const different = action(nodes, "Different customer");
    const edit = action(nodes, "Correct vehicle details");
    expect(style(saved)).toMatchObject({ backgroundColor: "#176BFF" });
    expect(style(different)).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#DDE4EC",
    });
    expect(style(edit)).toMatchObject({ backgroundColor: "transparent" });
    expect(session.useSavedCustomer).not.toHaveBeenCalled();
    expect(session.chooseDifferentCustomer).not.toHaveBeenCalled();
    (saved.props.onPress as () => void)();
    (different.props.onPress as () => void)();
    expect(session.useSavedCustomer).toHaveBeenCalledOnce();
    expect(session.chooseDifferentCustomer).toHaveBeenCalledOnce();
  });

  it("omits absent suggestion data and offers clear customer progression", () => {
    const { nodes } = render(
      snapshot({
        recognizedVehicle: { ...recognized, returningCustomer: null },
      }),
    );
    expect(action(nodes, "Continue to customer")).toBeDefined();
    expect(action(nodes, "Toyota Camry, 12-34567")).toBeDefined();
    expect(
      nodes.some((node) => node.props.children === "Returning customer"),
    ).toBe(false);
    expect(nodes.some((node) => node.props.children === "A. Customer")).toBe(
      false,
    );
    expect(
      nodes.some(
        (node) => node.props.accessibilityLabel === "Use saved customer",
      ),
    ).toBe(false);
  });

  it("omits a returning display name when the server supplies none", () => {
    const { nodes } = render(
      snapshot({
        recognizedVehicle: {
          ...recognized,
          returningCustomer: {
            ...recognized.returningCustomer,
            displayName: null,
          },
        },
      }),
    );
    const summary = action(nodes, "Returning customer, Phone ending 1234");
    expect(summary).toBeDefined();
    expect(nodes.some((node) => node.props.children === "A. Customer")).toBe(
      false,
    );
  });

  it.each([
    ["recognized", recognized, "Toyota Camry, 12-34567"],
    ["new plate", null, "New Vehicle, 12-34567"],
    ["descriptor", null, "New Vehicle, Silver SUV"],
  ] as const)(
    "keeps truthful %s vehicle context on Customer contact",
    (_, known, label) => {
      const draft =
        label === "New Vehicle, Silver SUV"
          ? {
              mode: "TEMPORARY_DESCRIPTOR" as const,
              plateCountry: "JO",
              plateNumberRaw: "",
              temporaryDescriptor: "Silver SUV",
            }
          : snapshot({}).vehicle;
      const session = controller();
      const { nodes } = render(
        snapshot({
          phase: "customer",
          recognizedVehicle: known,
          vehicle: draft,
        }),
        "en",
        session,
      );
      expect(action(nodes, label)).toBeDefined();
      expect(
        nodes.filter(
          (node) =>
            node.props.accessibilityRole === "header" &&
            node.props.children === "Customer Contact",
        ),
      ).toHaveLength(1);
      expect(session.submitCustomer).not.toHaveBeenCalled();
      expect(session.setCustomerPhone).not.toHaveBeenCalled();
    },
  );

  it.each(["en", "ar"] as const)(
    "keeps the %s phone field separate, LTR, tel, and tertiary when skipped",
    (locale) => {
      const { nodes } = render(snapshot({ phase: "customer" }), locale);
      const input = nodes.find((node) => node.type === "TextInput")!;
      const prefix = nodes.find((node) => node.props.children === "🇯🇴  +962")!;
      expect(input.props.inputMode).toBe("tel");
      expect(style(input)).toMatchObject({
        height: 56,
        writingDirection: "ltr",
      });
      expect(style(prefix)).toMatchObject({
        height: 56,
        writingDirection: "ltr",
      });
      expect(
        style(
          action(
            nodes,
            locale === "en" ? "No phone available" : "المتابعة دون رقم هاتف",
          ),
        ),
      ).toMatchObject({
        backgroundColor: "transparent",
      });
    },
  );
});
