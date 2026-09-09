import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInAuthoritativeSession,
  EmployeeCheckInSession,
  EmployeeCheckInSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";
import { emptyCheckInContinuation } from "@valet/employee-client";

const hooks = vi.hoisted(() => ({ setManual: vi.fn() }));
vi.mock("react", () => ({
  useEffect: vi.fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (init: unknown) => [
    typeof init === "function" ? (init as () => unknown)() : init,
    hooks.setManual,
  ],
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Pressable: "Pressable",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  ScrollView: "ScrollView",
  StyleSheet: { create: (v: unknown) => v },
}));
vi.mock("../src/check-in/native-plate-camera-step", () => ({
  NativePlateCameraStep: "NativePlateCameraStep",
}));
const { NativeCheckInWorkflow } =
  await import("../src/check-in/native-check-in-workflow");
const { VehicleCard, RecoverableCard } =
  await import("../src/check-in/native-check-in-primitives");
const { getNativeCheckInCopy } =
  await import("../src/check-in/native-check-in-copy");
const { checkInFailureMessage } =
  await import("../src/check-in/native-check-in-presentation");

type Element = ReactElement<Record<string, unknown>>;
function expand(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(expand);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return expand((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...expand(node.props.children)];
}
const vehicle = {
  mode: "CONFIRMED_PLATE" as const,
  plateCountry: "JO",
  plateNumberRaw: "12-34567",
  temporaryDescriptor: "",
};
function render(
  patch: Partial<EmployeeCheckInSnapshot>,
  locale: "en" | "ar" = "ar",
) {
  const session = {
    confirmIdentity: vi.fn(),
    continueWithoutRecognition: vi.fn(),
    editIdentity: vi.fn(),
    setVehicle: vi.fn(),
    reviewIdentity: vi.fn(),
    resume: vi.fn(),
  } as unknown as EmployeeCheckInSession;
  const onClose = vi.fn();
  const state: EmployeeCheckInSnapshot = {
    active: null,
    continuation: emptyCheckInContinuation(),
    customerPhone: "",
    error: null,
    identityGeneration: 1,
    locationId: "location",
    phase: "capture",
    recognizedVehicle: null,
    recoverables: [],
    recoveryChecked: false,
    vehicle,
    ...patch,
  };
  const nodes = expand(
    NativeCheckInWorkflow({
      auth: {} as NativeAuthSession,
      locale,
      onClose,
      session,
      snapshot: state,
    }),
  );
  return { nodes, session, onClose };
}
const direction = (rtl: boolean) => ({
  textAlign: rtl ? "right" : "left",
  writingDirection: rtl ? "rtl" : "ltr",
});
describe("Native Check-In review regressions", () => {
  it("offers camera-first assistance before fields, with no implicit confirmation", () => {
    const { nodes, session } = render({
      vehicle: { ...vehicle, plateNumberRaw: "" },
    });
    expect(nodes.some((node) => node.type === "NativePlateCameraStep")).toBe(
      true,
    );
    expect(nodes.some((node) => node.type === "TextInput")).toBe(false);
    expect(session.reviewIdentity).not.toHaveBeenCalled();
    const camera = nodes.find((node) => node.type === "NativePlateCameraStep")!;
    (camera.props.onNoPlate as () => void)();
    expect(hooks.setManual).not.toHaveBeenCalled();
    expect(session.setVehicle).toHaveBeenCalledWith({
      mode: "TEMPORARY_DESCRIPTOR",
      plateNumberRaw: "",
      temporaryDescriptor: "",
    });
    expect(session.reviewIdentity).toHaveBeenCalledOnce();
  });
  it.each(["en", "ar"] as const)(
    "uses human entry and Web-authoritative LTR descriptor confirmation in %s",
    (locale) => {
      const draft = {
        ...vehicle,
        mode: "TEMPORARY_DESCRIPTOR" as const,
        temporaryDescriptor: "تويوتا فضية",
        plateNumberRaw: "",
      };
      const field = render({ vehicle: draft }, locale).nodes.find(
        (node) => node.type === "TextInput",
      )!;
      expect(field.props.style).toContainEqual(direction(locale === "ar"));
      const confirmation = render(
        { vehicle: draft, phase: "confirm" },
        locale,
      ).nodes.find(
        (node) => node.props.children === draft.temporaryDescriptor,
      )!;
      expect(confirmation.props.style).toContainEqual({
        textAlign: "center",
        writingDirection: "ltr",
      });
    },
  );
  it("keeps Arabic plate entry/confirmation and phone LTR, with separate +962", () => {
    const plate = render({}).nodes.find((node) => node.type === "TextInput")!;
    expect(plate.props.style).toContainEqual({
      textAlign: "center",
      writingDirection: "ltr",
    });
    const confirmation = render({ phase: "confirm" }).nodes.find(
      (node) => node.props.children === vehicle.plateNumberRaw,
    )!;
    expect(confirmation.props.style).toContainEqual({
      textAlign: "center",
      writingDirection: "ltr",
    });
    const phone = render({ phase: "customer" }).nodes;
    expect(
      phone.find((node) => node.type === "TextInput")!.props.style,
    ).toContainEqual(direction(false));
    expect(
      phone.some(
        (node) => node.type === "Text" && node.props.children === "🇯🇴  +962",
      ),
    ).toBe(true);
  });
  it.each([true, false])(
    "uses semantic vehicle/recoverable card direction (plate=%s)",
    (hasPlate) => {
      const cardVehicle: EmployeeCheckInAuthoritativeSession["vehicle"] = {
        color: null,
        make: null,
        model: null,
        plateCountry: hasPlate ? "JO" : null,
        plateNumberRaw: hasPlate ? "12-34567" : null,
        temporaryDescriptor: hasPlate ? null : "تويوتا فضية",
        vehicleId: "vehicle",
        vehicleUpdatedAt: "date",
      };
      const recoverable = {
        kind: "DRAFT" as const,
        value: {
          vehicle: cardVehicle,
          sessionId: "session",
          createdAt: "date",
          conditionCompletedAt: null,
        },
      };
      for (const card of [
        VehicleCard({
          fallback: "المركبة",
          textAlign: "right",
          vehicle: cardVehicle,
        }),
        RecoverableCard({
          label: "مسودة",
          onPress: vi.fn(),
          recoverable,
          textAlign: "right",
          vehicleFallback: "المركبة",
        }),
      ]) {
        const identifier = expand(card).find(
          (node) =>
            node.props.children ===
            (cardVehicle.plateNumberRaw ?? cardVehicle.temporaryDescriptor),
        )!;
        expect(identifier.props.style).toContainEqual(direction(!hasPlate));
      }
    },
  );
  it("multiple recoverables expose only resume and Back, never Start New", () => {
    const draft = {
      kind: "DRAFT" as const,
      value: {
        vehicle: {
          color: null,
          make: null,
          model: null,
          plateCountry: "JO",
          plateNumberRaw: "12-34567",
          temporaryDescriptor: null,
        },
        sessionId: "one",
        createdAt: "date",
        conditionCompletedAt: null,
      },
    };
    const { nodes, session } = render(
      {
        phase: "recoverables",
        recoverables: [
          draft,
          { ...draft, value: { ...draft.value, sessionId: "two" } },
        ],
      },
      "en",
    );
    const buttons = nodes.filter((node) => node.type === "Pressable");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]!.props.accessibilityLabel).toBe("Back");
    (buttons[1]!.props.onPress as () => void)();
    expect(session.resume).toHaveBeenCalledWith(draft);
  });
  it.each([
    "submitting",
    "recognizing",
    "customer",
    "intake-ambiguous",
  ] as const)("guards visible Back for %s", (phase) => {
    const { nodes, onClose } = render({ phase }, "en");
    const back = nodes.find(
      (node) => node.props.accessibilityLabel === "Back",
    )!;
    const blocked = phase === "submitting" || phase === "recognizing";
    expect(back.props.disabled).toBe(blocked);
    (back.props.onPress as () => void)();
    expect(onClose).toHaveBeenCalledTimes(blocked ? 0 : 1);
    if (phase === "intake-ambiguous")
      expect(
        nodes.some(
          (node) => node.props.accessibilityLabel === "Check server state",
        ),
      ).toBe(true);
  });
  it.each(["en", "ar"] as const)(
    "provides actionable localized customer recovery copy in %s",
    (locale) => {
      const copy = getNativeCheckInCopy(locale);
      expect(
        checkInFailureMessage(copy, {
          code: "CUSTOMER_PHONE_AMBIGUOUS",
          message: "private",
        }),
      ).toBe(copy.phoneAmbiguous);
      expect(copy.phoneAmbiguous).not.toBe(copy.differentCustomer);
      expect(
        checkInFailureMessage(copy, {
          code: "RETURNING_CUSTOMER_INTENT_INVALID",
          message: "private",
        }),
      ).toBe(copy.savedCustomerStale);
      expect(copy.savedCustomerStale).not.toBe(copy.savedBody);
    },
  );
});
