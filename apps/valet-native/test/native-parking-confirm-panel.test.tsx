import type {
  EmployeeConfirmParkedSnapshot,
  NativeAuthSession,
} from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
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
vi.mock("../src/parking/native-parking-qr-input", () => ({
  NativeParkingQrInput: (props: unknown) => ({ type: "QrInput", props }),
}));
vi.mock("../src/employee-ui/employee-icons", () => ({
  EmployeeBackIcon: () => ({ type: "BackIcon", props: {} }),
  EmployeeBigCheckIcon: () => ({ type: "BigCheck", props: {} }),
}));

const { NativeParkingConfirmPanel } =
  await import("../src/parking/native-parking-confirm-panel");
const { nativeParkingConfirmStyles } =
  await import("../src/parking/native-parking-confirm-styles");
const { content, elements, style } =
  await import("./native-check-in-condition-test-support");

const scope = {
  locationCode: "AMM-1",
  locationId: "11111111-1111-4111-8111-111111111111",
  locationName: "Amman Hotel",
  membershipId: "22222222-2222-4222-8222-222222222222",
  organizationId: "33333333-3333-4333-8333-333333333333",
  organizationName: "Operator",
  role: "VALET_EMPLOYEE" as const,
  shiftId: "55555555-5555-4555-8555-555555555555",
  shiftStartedAt: "2026-09-07T07:00:00.000Z",
};
const task = {
  createdAt: "2026-09-07T08:00:00.000Z",
  currentAssigneeMembershipId: scope.membershipId,
  parkingSpot: null,
  parkingZone: "A",
  retrievalRequestedAt: null,
  sessionId: "44444444-4444-4444-8444-444444444444",
  status: "IN_PROGRESS" as const,
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "PARKING" as const,
  valetSessionState: "PARKING" as const,
  valetSessionVersion: 3,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
  version: 4,
};
const session = {
  checkIn: { conditionCompletedAt: "2026-09-07T07:59:00.000Z" },
  guestAccess: {
    expiresAt: null,
    revokedAt: null,
    status: "NOT_ISSUED" as const,
  },
  handoff: { pendingAt: null, verification: null },
  keySlot: null,
  locationId: scope.locationId,
  parking: {
    parkedAt: null,
    parkingSpotCode: null,
    parkingStartedAt: "2026-09-07T08:05:00.000Z",
    parkingZoneCode: "A",
  },
  sessionId: task.sessionId,
  state: "PARKING" as const,
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
  version: 3,
};

function snapshot(
  phase: EmployeeConfirmParkedSnapshot["phase"],
  conflict: EmployeeConfirmParkedSnapshot["conflict"] = null,
): EmployeeConfirmParkedSnapshot {
  const hasSpot = !["inactive", "loading", "spot"].includes(phase);
  return {
    conflict,
    failure: null,
    identityGeneration: 7,
    keySlotCandidate: hasSpot && phase !== "slot" ? "K-03" : "",
    parked:
      phase === "parked"
        ? {
            keySlotCode: "K-03",
            parkedAt: "2026-09-07T08:15:00.000Z",
            parkingSpotCode: "P-101",
            sessionVersion: 4,
            source: "reconciliation",
          }
        : null,
    parkingSpotCandidate: hasSpot ? "P-101" : "",
    phase,
    scope,
    session,
    task,
  };
}

function render(
  phase: EmployeeConfirmParkedSnapshot["phase"],
  locale: "en" | "ar" = "en",
  conflict: EmployeeConfirmParkedSnapshot["conflict"] = null,
  online = true,
) {
  const confirmation = {
    backToSpot: vi.fn(),
    checkServerState: vi.fn(),
    confirmParked: vi.fn(),
    continueToKeySlot: vi.fn(),
    enterKeySlot: vi.fn(),
    enterParkingSpot: vi.fn(),
  };
  const onDone = vi.fn();
  const nodes = elements(
    NativeParkingConfirmPanel({
      auth: {} as NativeAuthSession,
      confirmation: confirmation as never,
      locale,
      online,
      onDone,
      snapshot: snapshot(phase, conflict),
    }),
  );
  return { confirmation, nodes, onDone };
}

function action(nodes: ReturnType<typeof elements>, label: string) {
  return nodes.find(
    (node) =>
      node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
}

describe("MOB-012B Native Confirm Parked", () => {
  it.each([
    ["en", "Parking Spot"],
    ["ar", "موقع الإيقاف"],
  ] as const)("renders the Spot-first step in %s", (locale, heading) => {
    const { nodes } = render("spot", locale);
    expect(content(nodes)).toContain(heading);
    expect(nodes.filter((node) => node.type === "QrInput")).toMatchObject([
      {
        props: {
          disabled: false,
          kind: "parking-spot",
          manualInput: false,
          value: "",
        },
      },
    ]);
    expect(
      action(
        nodes,
        locale === "ar"
          ? "إدخال رمز الموقع يدوياً"
          : "Enter spot code manually",
      ),
    ).toBeDefined();
    expect(
      action(nodes, locale === "ar" ? "متابعة" : "Continue"),
    ).toBeUndefined();
  });
  it("keeps Key Slot second with Web guidance and no preassignment", () => {
    const { nodes } = render("slot");
    expect(content(nodes)).toContain(
      "Place the key into any available free slot",
    );
    expect(content(nodes)).not.toMatch(/reserved|assigned/i);
    expect(nodes.find((node) => node.type === "QrInput")?.props).toMatchObject({
      kind: "key-slot",
      value: "",
    });
  });
  it("presents one dominant Confirm Parked action only when ready", () => {
    const { confirmation, nodes } = render("ready");
    const confirm = action(nodes, "Confirm Parked")!;
    expect(confirm.props.accessibilityState).toMatchObject({ disabled: false });
    (confirm.props.onPress as () => void)();
    expect(confirmation.confirmParked).toHaveBeenCalledOnce();
  });
  it("keeps protected confirmation unavailable offline", () => {
    const { confirmation, nodes } = render("ready", "en", null, false);
    const confirm = action(nodes, "Confirm Parked")!;
    expect(content(nodes)).toContain("No network connection");
    expect(confirm.props.accessibilityState).toMatchObject({ disabled: true });
    (confirm.props.onPress as () => void)();
    expect(confirmation.confirmParked).not.toHaveBeenCalled();
  });
  it("locks Back, candidate input, and duplicate action while busy", () => {
    const { nodes } = render("submitting");
    expect(action(nodes, "Back")?.props.disabled).toBe(true);
    expect(action(nodes, "Confirming...")?.props).toMatchObject({
      disabled: true,
    });
    expect(nodes.find((node) => node.type === "TextInput")?.props.value).toBe(
      "K-03",
    );
    expect(action(nodes, "Scan again")?.props.disabled).toBe(true);
  });

  it.each([
    ["spot", "spot", "The operation failed. Refresh and try again."],
    ["slot", "slot", "This key slot is no longer available"],
  ] as const)(
    "renders truthful %s conflict recovery",
    (phase, conflict, copy) => {
      const { nodes } = render(phase, "en", conflict);
      expect(content(nodes)).toContain(copy);
      const confirm = action(nodes, "Confirm Parked");
      if (phase === "spot") expect(confirm).toBeUndefined();
      else expect(confirm?.props.disabled).toBe(true);
    },
  );

  it("offers only a read-only canonical check while ambiguous", () => {
    const { confirmation, nodes } = render("ambiguous");
    const check = action(nodes, "Retry")!;
    (check.props.onPress as () => void)();
    expect(content(nodes)).toContain(
      "The operation failed. Refresh and try again.",
    );
    expect(confirmation.checkServerState).toHaveBeenCalledOnce();
    expect(confirmation.confirmParked).not.toHaveBeenCalled();
    expect(action(nodes, "Confirm Parked")).toBeUndefined();
  });

  it("localizes Arabic conflict and ambiguous recovery actions", () => {
    const slot = render("slot", "ar", "slot").nodes;
    expect(content(slot)).toContain("هذه الخانة لم تعد متاحة");
    const ambiguous = render("ambiguous", "ar").nodes;
    expect(content(ambiguous)).toContain(
      "تعذر تنفيذ العملية. حدّث الصفحة وحاول مجدداً.",
    );
    expect(action(ambiguous, "إعادة المحاولة")).toBeDefined();
  });

  it("shows authoritative Parked completion without Retrieval", () => {
    const { nodes } = render("parked");
    expect(content(nodes)).toContain("Vehicle parked and key returned");
    expect(content(nodes)).toContain("P-101");
    expect(content(nodes)).toContain("K-03");
    expect(content(nodes)).not.toMatch(/retriev|handoff|payment/i);
    expect(action(nodes, "Done")).toBeDefined();
    expect(nodes.some((node) => node.type === "BigCheck")).toBe(true);
  });

  it("keeps operational identifiers LTR under Arabic RTL", () => {
    const { nodes } = render("parked", "ar");
    expect(
      nodes.find((node) => node.type === "ScrollView")?.props
        .contentContainerStyle,
    ).toContainEqual({ direction: "rtl" });
    expect(content(nodes)).toContain("P-101");
    expect(content(nodes)).toContain("K-03");
    expect(nativeParkingConfirmStyles.identifier).toMatchObject({
      writingDirection: "ltr",
    });
    expect(
      style(
        nodes.find(
          (node) =>
            Array.isArray(node.props.children) &&
            node.props.children.includes("Toyota Camry"),
        )!,
      ),
    ).toMatchObject({ writingDirection: "rtl" });
    expect(
      style(nodes.find((node) => node.props.children === "12-34567")!),
    ).toMatchObject({ writingDirection: "ltr" });
  });
});
