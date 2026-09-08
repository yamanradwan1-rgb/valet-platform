import type { EmployeeRetrievalSnapshot } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (callback: () => void) => callback(),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Linking: { openSettings: vi.fn() },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("expo-camera", () => ({
  Camera: {
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  },
  CameraView: "CameraView",
}));

const { NativeRetrievalPanel } =
  await import("../src/retrieval/native-retrieval-panel");
const { content, elements, style } =
  await import("./native-check-in-condition-test-support");

const task = {
  createdAt: "2026-09-07T09:00:00.000Z",
  currentAssigneeMembershipId: "22222222-2222-4222-8222-222222222222",
  parkingSpot: "LC-7",
  parkingZone: "ZONE-LC",
  retrievalRequestedAt: "2026-09-07T09:05:00.000Z",
  sessionId: "44444444-4444-4444-8444-444444444444",
  status: "ACCEPTED" as const,
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "RETRIEVAL" as const,
  valetSessionState: "REQUESTED" as const,
  valetSessionVersion: 5,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
  version: 3,
};

const session = {
  checkIn: { conditionCompletedAt: "2026-09-07T07:59:00.000Z" },
  guestAccess: {
    expiresAt: null,
    revokedAt: null,
    status: "NOT_ISSUED" as const,
  },
  handoff: { pendingAt: null, verification: null },
  keySlot: { code: "K-9" },
  locationId: "11111111-1111-4111-8111-111111111111",
  parking: {
    parkedAt: "2026-09-07T08:10:00.000Z",
    parkingSpotCode: "LC-7",
    parkingStartedAt: "2026-09-07T08:00:00.000Z",
    parkingZoneCode: "ZONE-LC",
  },
  sessionId: task.sessionId,
  state: "REQUESTED" as const,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateCountry: "JO",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
    vehicleId: "77777777-7777-4777-8777-777777777777",
    vehicleUpdatedAt: "2026-09-07T07:55:00.000Z",
  },
  version: 5,
};

const scope = {
  locationCode: "AMM-1",
  locationId: session.locationId,
  locationName: "Amman Hotel",
  membershipId: task.currentAssigneeMembershipId,
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE" as const,
  shiftId: "55555555-5555-4555-8555-555555555555",
  shiftStartedAt: "2026-09-07T07:00:00.000Z",
};

function snapshot(
  phase: EmployeeRetrievalSnapshot["phase"],
  overrides: Partial<EmployeeRetrievalSnapshot> = {},
): EmployeeRetrievalSnapshot {
  const withTask =
    phase === "loading" || phase === "inactive"
      ? null
      : phase === "retrieving" || phase === "submitting-ready"
        ? {
            ...task,
            status: "IN_PROGRESS" as const,
            valetSessionState: "RETRIEVING",
          }
        : phase === "ready"
          ? null
          : task;
  return {
    failure: null,
    identityGeneration: 7,
    keyConfirmed: false,
    keySlotCandidate: "",
    phase,
    readyAt: phase === "ready" ? "2026-09-07T09:20:00.000Z" : null,
    retrievalStartedAt: null,
    scope,
    session:
      phase === "loading" || phase === "inactive"
        ? null
        : phase === "retrieving" || phase === "submitting-ready"
          ? { ...session, state: "RETRIEVING" as const, version: 6 }
          : phase === "ready"
            ? { ...session, state: "READY" as const, version: 7 }
            : session,
    task: withTask,
    ...overrides,
  };
}

function render(
  phase: EmployeeRetrievalSnapshot["phase"],
  locale: "en" | "ar" = "en",
  overrides: Partial<EmployeeRetrievalSnapshot> = {},
) {
  const retrieval = {
    checkServerState: vi.fn(),
    confirmKeySlot: vi.fn(() => true),
    enterKeySlot: vi.fn(),
    markReady: vi.fn(),
    startRetrieval: vi.fn(),
  };
  const onBack = vi.fn();
  const nodes = elements(
    NativeRetrievalPanel({
      auth: {} as never,
      locale,
      onBack,
      retrieval: retrieval as never,
      snapshot: snapshot(phase, overrides),
    }),
  );
  return { nodes, onBack, retrieval };
}

function action(nodes: ReturnType<typeof elements>, label: string) {
  return nodes.find(
    (node) =>
      node.type === "Pressable" &&
      node.props.accessibilityLabel === label &&
      node.props.accessibilityRole === "button",
  );
}

describe("MOB-013 Native Retrieval", () => {
  it.each([
    ["en", "Key checkout", "K-9"],
    ["ar", "استلام المفتاح", "K-9"],
  ] as const)(
    "renders the key-checkout stage with the authoritative expected Key Slot in %s",
    (locale, title, key) => {
      const { nodes } = render("key-checkout", locale);
      expect(content(nodes)).toContain(title);
      expect(content(nodes)).toContain(key);
      expect(content(nodes)).toContain(
        locale === "ar"
          ? "امسح رمز خانة المفتاح أو أدخل الرمز للتحقق من مطابقته للخانة المتوقعة قبل بدء الاسترجاع."
          : "Scan the key slot QR or enter its code to verify it matches the expected slot before starting the retrieval.",
      );
    },
  );

  it("requires Key Slot verification before exposing Start Retrieval", () => {
    const { nodes, retrieval } = render("key-checkout");
    expect(action(nodes, "Start Retrieval")).toBeUndefined();
    expect(retrieval.confirmKeySlot).not.toHaveBeenCalled();
  });

  it("exposes Start Retrieval only after the Key Slot is confirmed", () => {
    const { nodes, retrieval } = render("key-checkout", "en", {
      keyConfirmed: true,
    });
    const start = action(nodes, "Start Retrieval")!;
    (start.props.onPress as () => void)();
    expect(retrieval.startRetrieval).toHaveBeenCalledOnce();
  });

  it("sends Mark Ready from the retrieving stage and blocks Back while busy", () => {
    const { nodes, onBack } = render("submitting-ready");
    expect(action(nodes, "Marking vehicle ready…")?.props).toMatchObject({
      disabled: true,
    });
    expect(action(nodes, "Back")?.props).toMatchObject({ disabled: true });
    expect(content(nodes)).toContain("Retrieving");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("keeps the plate in an LTR identifier island under Arabic RTL", () => {
    const { nodes } = render("key-checkout", "ar");
    expect(
      nodes.find((node) => node.type === "ScrollView")?.props
        .contentContainerStyle,
    ).toContainEqual({ direction: "rtl" });
    const plate = nodes.find((node) => node.props.children === "12-34567")!;
    expect(style(plate)).toMatchObject({
      textAlign: "left",
      writingDirection: "ltr",
    });
  });

  it.each([
    ["ambiguous", "Retrieval result unknown"],
    ["conflict", "Retrieval work changed"],
    ["unavailable", "Unable to load Retrieval Task"],
  ] as const)(
    "presents the %s recovery state without a protected retry",
    (phase, title) => {
      const { nodes, retrieval } = render(phase);
      expect(content(nodes)).toContain(title);
      const check = action(nodes, "Check server state")!;
      (check.props.onPress as () => void)();
      expect(retrieval.checkServerState).toHaveBeenCalledOnce();
      expect(action(nodes, "Start Retrieval")).toBeUndefined();
    },
  );

  it.each(["en", "ar"] as const)(
    "shows only the READY boundary without release authority or proof UI in %s",
    (locale) => {
      const { nodes } = render("ready", locale);
      const text = content(nodes);
      expect(text).toContain(
        locale === "ar" ? "المركبة جاهزة" : "Vehicle ready",
      );
      // The verified state must not present a release success message or
      // any handoff proof entry (pickup code / Dynamic QR inputs).
      expect(text).not.toMatch(
        /released|release the vehicle|pickup code|dynamic qr|verify|released|تم التحرير|حرر المركبة|رمز الاستلام|تحقق/i,
      );
    },
  );
});
