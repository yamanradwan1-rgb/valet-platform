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
  patch: Partial<EmployeeCheckInSnapshot> = {},
): EmployeeCheckInSnapshot {
  return {
    active: null,
    customerPhone: "790001234",
    error: null,
    identityGeneration: 1,
    locationId: "location",
    phase: "discovering",
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
function controller() {
  return {
    confirmIdentity: vi.fn(),
    recoverAmbiguous: vi.fn(),
    retryDiscovery: vi.fn(),
    retryIntake: vi.fn(),
    submitCustomer: vi.fn(),
  } as unknown as EmployeeCheckInSession;
}
function render(
  state: EmployeeCheckInSnapshot,
  locale: "en" | "ar" = "en",
  session = controller(),
) {
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
function button(nodes: Element[], label: string) {
  return nodes.find(
    (node) =>
      node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
}
function content(nodes: Element[]) {
  return nodes
    .flatMap((node) => [node.props.children].flat())
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

describe("MOB-010 Patch 5 loading and recovery presentation", () => {
  it.each([
    ["en", "Checking for existing check-in drafts..."],
    ["ar", "جارٍ التحقق من عمليات التسجيل غير المكتملة..."],
  ] as const)("centers localized discovery progress in %s", (locale, label) => {
    const session = controller();
    const { nodes } = render(snapshot(), locale, session);
    expect(
      nodes.some((node) => node.props.accessibilityRole === "header"),
    ).toBe(false);
    const progress = nodes.find(
      (node) => node.props.accessibilityRole === "progressbar",
    )!;
    expect(progress.props).toMatchObject({
      accessibilityLabel: label,
      accessibilityLiveRegion: "polite",
      accessibilityState: { busy: true },
    });
    expect(style(progress)).toMatchObject({
      alignItems: "center",
      justifyContent: "center",
      minHeight: 320,
    });
    expect(session.retryDiscovery).not.toHaveBeenCalled();
  });

  it("uses a safe titled discovery error with exact retry and return actions", () => {
    const session = controller();
    const { nodes, onClose } = render(
      snapshot({
        error: { code: "SERVICE_UNAVAILABLE", message: "private sql detail" },
        phase: "discovery-error",
      }),
      "en",
      session,
    );
    const alert = nodes.find(
      (node) => node.props.accessibilityRole === "alert",
    )!;
    expect(alert.props.accessibilityLabel).toBe(
      "Failed to load check-in session. The operation failed. Refresh and try again.",
    );
    expect(content(nodes)).not.toContain("private sql detail");
    (button(nodes, "Retry Discovery")!.props.onPress as () => void)();
    (button(nodes, "Back to Task Queue")!.props.onPress as () => void)();
    expect(session.retryDiscovery).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps confirmed identity visible and non-repeatable while recognizing", () => {
    const session = controller();
    const { nodes, onClose } = render(
      snapshot({ phase: "recognizing" }),
      "en",
      session,
    );
    expect(content(nodes)).toContain("12-34567");
    expect(
      style(nodes.find((node) => node.props.children === "12-34567")!),
    ).toMatchObject({ textAlign: "center", writingDirection: "ltr" });
    const busy = button(nodes, "Checking for existing check-in drafts...")!;
    expect(busy.props).toMatchObject({
      accessibilityState: { busy: true, disabled: true },
      disabled: true,
    });
    expect(nodes.some((node) => node.type === "ActivityIndicator")).toBe(true);
    (busy.props.onPress as () => void)();
    expect(session.confirmIdentity).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(button(nodes, "Back")!.props.disabled).toBe(true);
  });

  it.each([
    ["recognized", "Toyota Camry", "12-34567", "ltr"],
    ["draft", "New Vehicle", "12-34567", "ltr"],
    ["descriptor", "مركبة جديدة", "تويوتا فضية", "rtl"],
  ] as const)(
    "retains %s vehicle context while submitting",
    (kind, expected, identity, direction) => {
      const recognizedVehicle =
        kind === "recognized"
          ? {
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
              vehicleUpdatedAt: "date",
            }
          : null;
      const state = snapshot({
        phase: "submitting",
        recognizedVehicle,
        vehicle:
          kind === "descriptor"
            ? {
                mode: "TEMPORARY_DESCRIPTOR",
                plateCountry: "JO",
                plateNumberRaw: "",
                temporaryDescriptor: identity,
              }
            : snapshot().vehicle,
      });
      const session = controller();
      const { nodes } = render(
        state,
        kind === "descriptor" ? "ar" : "en",
        session,
      );
      expect(content(nodes)).toContain(expected);
      expect(
        style(nodes.find((node) => node.props.children === identity)!),
      ).toMatchObject({
        writingDirection: direction,
      });
      expect(content(nodes)).not.toMatch(/using saved customer/i);
      const busy = button(
        nodes,
        kind === "descriptor"
          ? "جارٍ إنشاء سجل الوصول..."
          : "Creating Intake...",
      )!;
      expect(busy.props.accessibilityState).toMatchObject({
        busy: true,
        disabled: true,
      });
      (busy.props.onPress as () => void)();
      expect(session.submitCustomer).not.toHaveBeenCalled();
      expect(
        button(nodes, kind === "descriptor" ? "رجوع" : "Back")!.props.disabled,
      ).toBe(true);
    },
  );

  it("preserves authoritative ambiguous recovery ordering and exact callbacks", () => {
    const session = controller();
    const initial = render(
      snapshot({
        error: { code: "REQUEST_TIMEOUT", message: "private" },
        phase: "intake-ambiguous",
      }),
      "en",
      session,
    ).nodes;
    expect(button(initial, "Retry same check-in")).toBeUndefined();
    expect(session.recoverAmbiguous).not.toHaveBeenCalled();
    expect(session.retryIntake).not.toHaveBeenCalled();
    (button(initial, "Retry")!.props.onPress as () => void)();
    expect(session.recoverAmbiguous).toHaveBeenCalledOnce();
    const checking = render(
      snapshot({ phase: "intake-ambiguous" }),
      "en",
      session,
    ).nodes;
    expect(button(checking, "Retry")!.props).toMatchObject({
      accessibilityState: { busy: true, disabled: true },
      disabled: true,
    });
    const checked = render(
      snapshot({ phase: "intake-ambiguous", recoveryChecked: true }),
      "en",
      session,
    ).nodes;
    (button(checked, "Retry Discovery")!.props.onPress as () => void)();
    expect(session.retryIntake).toHaveBeenCalledOnce();
    expect(content(checked)).not.toContain("Start New");
  });
});
