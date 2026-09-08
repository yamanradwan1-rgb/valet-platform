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
  return Object.assign(
    {},
    ...[node.props.style].flat(Infinity).filter(Boolean),
  );
}
function snapshot(phase: "created" | "continuation"): EmployeeCheckInSnapshot {
  return {
    active: {
      sessionId: "session-id",
      state: phase === "created" ? "CHECKING_IN" : "AWAITING_PARKING",
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
    },
    customerPhone: "",
    error: null,
    identityGeneration: 1,
    locationId: "location",
    phase,
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
function render(phase: "created" | "continuation", locale: "en" | "ar") {
  const onClose = vi.fn();
  const session = {
    recoverAmbiguous: vi.fn(),
    retryIntake: vi.fn(),
    startNew: vi.fn(),
  } as unknown as EmployeeCheckInSession;
  const nodes = elements(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose,
      session,
      snapshot: snapshot(phase),
    }),
  );
  return { nodes, onClose, session };
}
function content(nodes: Element[]) {
  return nodes
    .flatMap((node) => [node.props.children].flat())
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

describe("MOB-010 Patch 5 truthful completion presentation", () => {
  it.each([
    ["created", "en", "Intake saved", "#EDF4FF", "#176BFF"],
    ["continuation", "en", "Ready for parking", "#EEFBF5", "#2F9B78"],
    ["created", "ar", "تم حفظ سجل الوصول", "#EDF4FF", "#176BFF"],
    ["continuation", "ar", "جاهزة للاصطفاف", "#EEFBF5", "#2F9B78"],
  ] as const)(
    "renders %s as a distinct localized operational state in %s",
    (phase, locale, title, backgroundColor, color) => {
      const { nodes, onClose, session } = render(phase, locale);
      expect(
        nodes.filter(
          (node) =>
            node.props.accessibilityRole === "header" &&
            node.props.children === title,
        ),
      ).toHaveLength(1);
      expect(content(nodes)).toContain("Toyota Camry");
      expect(content(nodes)).toContain("12-34567");
      const badgeLabel =
        phase === "created"
          ? locale === "en"
            ? "Saved"
            : "محفوظ"
          : locale === "en"
            ? "Awaiting parking"
            : "بانتظار الاصطفاف";
      expect(
        style(
          nodes.find(
            (node) =>
              node.props.children === badgeLabel &&
              style(node).backgroundColor === backgroundColor,
          )!,
        ),
      ).toMatchObject({ backgroundColor, color });
      const copy = content(nodes);
      if (phase === "created") {
        expect(copy).toMatch(/Vehicle Condition|فحص حالة المركبة/);
      } else {
        expect(copy).toMatch(/awaiting parking|بانتظار الاصطفاف/i);
      }
      expect(copy).not.toMatch(/Start Parking|بدء الاصطفاف/);
      expect(copy).not.toContain("Start New");
      expect(
        nodes.some(
          (node) =>
            node.type === "Pressable" &&
            /condition|فحص حالة/.test(String(node.props.accessibilityLabel)),
        ),
      ).toBe(false);
      expect(nodes.some((node) => node.props.children === "✓")).toBe(false);
      expect(session.startNew).not.toHaveBeenCalled();
      const close = nodes.find(
        (node) =>
          node.type === "Pressable" &&
          node.props.accessibilityLabel ===
            (phase === "continuation"
              ? locale === "en"
                ? "Continue to Parking Task"
                : "متابعة مهمة الاصطفاف"
              : locale === "en"
                ? "Back to tasks"
                : "العودة إلى المهام"),
      )!;
      (close.props.onPress as () => void)();
      expect(onClose).toHaveBeenCalledOnce();
    },
  );

  it("keeps created and continuation status language materially distinct", () => {
    const created = content(render("created", "en").nodes);
    const continuation = content(render("continuation", "en").nodes);
    expect(created).toContain("current Native scope");
    expect(continuation).toContain("current Parking Task");
    expect(created).not.toBe(continuation);
  });
});
