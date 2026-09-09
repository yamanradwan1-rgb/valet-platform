import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";

const hooks = vi.hoisted(() => ({ setState: vi.fn() }));
vi.mock("react", () => ({
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    hooks.setState,
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
  if (typeof node.type === "function") {
    return elements((node.type as (props: unknown) => unknown)(node.props));
  }
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
  patch: Partial<EmployeeCheckInSnapshot> = {},
): EmployeeCheckInSnapshot {
  return {
    active: null,
    customerPhone: "",
    error: null,
    identityGeneration: 1,
    locationId: "location",
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

function render(state: EmployeeCheckInSnapshot, locale: "en" | "ar" = "en") {
  const session = {
    confirmIdentity: vi.fn(),
    continueWithoutRecognition: vi.fn(),
    editIdentity: vi.fn(),
    reviewIdentity: vi.fn(),
    setVehicle: vi.fn(),
  } as unknown as EmployeeCheckInSession;
  const onClose = vi.fn();
  const nodes = elements(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose,
      session,
      snapshot: state,
    }),
  );
  return { nodes, onClose, session };
}

describe("MOB-010 Patch 3 identity visual contract", () => {
  it("uses the compact country field and exact localized radio choices", () => {
    const { nodes, session } = render(snapshot(), "ar");
    const selector = nodes.find(
      (node) =>
        node.props.accessibilityRole === "button" &&
        (node.props.accessibilityValue as { text?: string } | undefined)
          ?.text === "JO",
    )!;
    expect(style(selector)).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#DDE4EC",
      borderRadius: 12,
      minHeight: 48,
      paddingHorizontal: 16,
    });
    const options = nodes.filter(
      (node) => node.props.accessibilityRole === "radio",
    );
    expect(
      options.map(
        (node) => (node.props.accessibilityValue as { text: string }).text,
      ),
    ).toEqual(["JO", "AE", "SA", "KW", "BH", "OTHER"]);
    expect(options.map((node) => node.props.accessibilityLabel)).toEqual([
      "الأردن (JO)",
      "الإمارات (AE)",
      "السعودية (SA)",
      "الكويت (KW)",
      "البحرين (BH)",
      "أخرى",
    ]);
    expect(options[0]!.props.accessibilityState).toEqual({ checked: true });
    (options.at(-1)!.props.onPress as () => void)();
    expect(session.setVehicle).toHaveBeenCalledWith({ plateCountry: "OTHER" });
    expect(hooks.setState).toHaveBeenCalledWith(false);
  });

  it("uses one contextual BackHeader title for each identity presentation", () => {
    const cases: [EmployeeCheckInSnapshot, string][] = [
      [
        snapshot({
          vehicle: { ...snapshot().vehicle, plateNumberRaw: "" },
        }),
        "Scan Plate",
      ],
      [snapshot(), "Enter Plate"],
      [
        snapshot({
          vehicle: {
            ...snapshot().vehicle,
            mode: "TEMPORARY_DESCRIPTOR",
            plateNumberRaw: "",
            temporaryDescriptor: "Silver SUV",
          },
        }),
        "Temporary Descriptor",
      ],
      [snapshot({ phase: "confirm" }), "Confirm Plate"],
    ];
    for (const [state, title] of cases) {
      const matches = render(state).nodes.filter(
        (node) => node.props.children === title,
      );
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(
        matches.filter((node) => node.props.accessibilityRole === "header"),
      ).toHaveLength(1);
    }
  });

  it("uses Back as local manual-to-camera navigation without clearing Check-In", () => {
    hooks.setState.mockClear();
    const { nodes, onClose, session } = render(snapshot());
    const back = nodes.find(
      (node) => node.props.accessibilityLabel === "Back",
    )!;
    (back.props.onPress as () => void)();
    expect(hooks.setState).toHaveBeenCalledWith("camera");
    expect(session.editIdentity).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns from descriptor fallback to plate entry through existing draft calls", () => {
    hooks.setState.mockClear();
    const state = snapshot({
      vehicle: {
        ...snapshot().vehicle,
        mode: "TEMPORARY_DESCRIPTOR",
        plateNumberRaw: "",
        temporaryDescriptor: "Silver SUV",
      },
    });
    const { nodes, onClose, session } = render(state);
    const back = nodes.find(
      (node) => node.props.accessibilityLabel === "Back",
    )!;
    (back.props.onPress as () => void)();
    expect(session.setVehicle).toHaveBeenCalledWith({
      mode: "CONFIRMED_PLATE",
    });
    expect(hooks.setState).toHaveBeenCalledWith("manual");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("returns confirmation to editable identity with the reviewed session action", () => {
    hooks.setState.mockClear();
    const { nodes, onClose, session } = render(snapshot({ phase: "confirm" }));
    const back = nodes.find(
      (node) => node.props.accessibilityLabel === "Back",
    )!;
    (back.props.onPress as () => void)();
    expect(session.editIdentity).toHaveBeenCalledOnce();
    expect(hooks.setState).toHaveBeenCalledWith("manual");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders truthful centered confirmation without capture claims", () => {
    const { nodes } = render(snapshot({ phase: "confirm" }));
    const identity = nodes.find((node) => node.props.children === "12-34567")!;
    expect(style(identity)).toMatchObject({
      fontSize: 36,
      fontWeight: "700",
      letterSpacing: 4,
      textAlign: "center",
      writingDirection: "ltr",
    });
    const copy = nodes
      .flatMap((node) => [node.props.children].flat())
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    expect(copy).toContain("Manual Entry");
    expect(copy).toContain("Jordan");
    expect(copy).not.toMatch(/detected|confidence|captured/i);
  });

  it("matches the Web 36px LTR-isolated Arabic descriptor hero", () => {
    const descriptor = "تويوتا فضية";
    const { nodes } = render(
      snapshot({
        phase: "confirm",
        vehicle: {
          ...snapshot().vehicle,
          mode: "TEMPORARY_DESCRIPTOR",
          plateNumberRaw: "",
          temporaryDescriptor: descriptor,
        },
      }),
      "ar",
    );
    expect(
      style(nodes.find((node) => node.props.children === descriptor)!),
    ).toMatchObject({
      fontSize: 36,
      textAlign: "center",
      writingDirection: "ltr",
    });
    expect(
      style(nodes.find((node) => node.props.children === descriptor)!),
    ).not.toHaveProperty("letterSpacing");
  });

  it("keeps Edit secondary and recovery conditional on an existing error", () => {
    const ready = render(snapshot({ phase: "confirm" })).nodes;
    const edit = ready.find(
      (node) => node.props.accessibilityLabel === "Edit",
    )!;
    expect(style(edit)).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#DDE4EC",
      borderWidth: 1,
    });
    expect(
      ready.some(
        (node) =>
          node.props.accessibilityLabel === "Continue without recognition",
      ),
    ).toBe(false);
    const failed = render(
      snapshot({
        error: { code: "NETWORK_ERROR", message: "private" },
        phase: "confirm",
      }),
    ).nodes;
    expect(
      failed.some(
        (node) =>
          node.props.accessibilityLabel === "Continue without recognition",
      ),
    ).toBe(true);
  });
});
