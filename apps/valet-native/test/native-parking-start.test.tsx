import type { EmployeeParkingStartSnapshot } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeParkingStartPanel } =
  await import("../src/parking/native-parking-start-panel");
const { content, elements, style } =
  await import("./native-check-in-condition-test-support");

const task = {
  createdAt: "2026-09-07T08:00:00.000Z",
  currentAssigneeMembershipId: "22222222-2222-4222-8222-222222222222",
  parkingSpot: null,
  parkingZone: null,
  retrievalRequestedAt: null,
  sessionId: "44444444-4444-4444-8444-444444444444",
  status: "ACCEPTED" as const,
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "PARKING" as const,
  valetSessionState: "AWAITING_PARKING" as const,
  valetSessionVersion: 2,
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
  keySlot: null,
  locationId: "11111111-1111-4111-8111-111111111111",
  parking: {
    parkedAt: null,
    parkingSpotCode: null,
    parkingStartedAt: null,
    parkingZoneCode: null,
  },
  sessionId: task.sessionId,
  state: "AWAITING_PARKING" as const,
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
  version: 2,
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
  phase: EmployeeParkingStartSnapshot["phase"],
  assignedStatus: "ASSIGNED" | "QUEUED" = "ASSIGNED",
): EmployeeParkingStartSnapshot {
  return {
    failure: null,
    identityGeneration: 7,
    phase,
    scope,
    session: phase === "loading" || phase === "inactive" ? null : session,
    task:
      phase === "loading" || phase === "inactive"
        ? null
        : phase === "started"
          ? { ...task, status: "IN_PROGRESS", valetSessionState: "PARKING" }
          : phase === "assigned"
            ? {
                ...task,
                currentAssigneeMembershipId:
                  assignedStatus === "QUEUED"
                    ? null
                    : task.currentAssigneeMembershipId,
                status: assignedStatus,
              }
            : task,
  };
}

function render(
  phase: EmployeeParkingStartSnapshot["phase"],
  locale: "en" | "ar" = "en",
  assignedStatus: "ASSIGNED" | "QUEUED" = "ASSIGNED",
) {
  const parking = {
    checkServerState: vi.fn(),
    startParking: vi.fn(),
  };
  const operations = {
    acceptTask: vi.fn(),
    current: () => ({ mutation: { phase: "idle" } }),
    refreshQueue: vi.fn(),
  };
  const onBack = vi.fn();
  const nodes = elements(
    NativeParkingStartPanel({
      locale,
      onBack,
      operations: operations as never,
      parking: parking as never,
      snapshot: snapshot(phase, assignedStatus),
    }),
  );
  return { nodes, onBack, operations, parking };
}

function action(nodes: ReturnType<typeof elements>, label: string) {
  return nodes.find(
    (node) =>
      node.type === "Pressable" && node.props.accessibilityLabel === label,
  );
}

describe("MOB-012A Native Parking Start", () => {
  it.each([
    ["en", "Parking Task", "Start Parking"],
    ["ar", "مهمة الاصطفاف", "بدء الاصطفاف"],
  ] as const)(
    "renders accepted entry and dominant action in %s",
    (locale, title, start) => {
      const { nodes } = render("accepted", locale);
      expect(content(nodes)).toContain(title);
      expect(action(nodes, start)?.props.accessibilityState).toMatchObject({
        disabled: false,
      });
      expect(content(nodes)).toContain(locale === "ar" ? "مقبولة" : "Accepted");
    },
  );

  it("sends one explicit Start action from the accepted state", () => {
    const { nodes, parking } = render("accepted");
    (action(nodes, "Start Parking")?.props.onPress as () => void)();
    expect(parking.startParking).toHaveBeenCalledOnce();
  });

  it("keeps the assigned Task separate and routes acceptance through the operational session", async () => {
    const { nodes, operations, parking } = render("assigned");
    const accept = action(nodes, "Accept task")!;
    (accept.props.onPress as () => void)();
    expect(operations.refreshQueue).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(operations.acceptTask).toHaveBeenCalledWith(task.taskId),
    );
    expect(parking.startParking).not.toHaveBeenCalled();
    await vi.waitFor(() =>
      expect(parking.checkServerState).toHaveBeenCalledOnce(),
    );
  });

  it("presents the completed-check-in queue boundary truthfully", () => {
    const { nodes } = render("assigned", "en", "QUEUED");
    expect(content(nodes)).toContain("Queued");
    expect(action(nodes, "Claim task")).toBeDefined();
    expect(action(nodes, "Start Parking")).toBeUndefined();
  });

  it("blocks duplicate interaction and Back while Start Parking is busy", () => {
    const { nodes } = render("submitting");
    expect(action(nodes, "Starting Parking…")?.props).toMatchObject({
      disabled: true,
    });
    expect(action(nodes, "Back")?.props).toMatchObject({ disabled: true });
  });

  it("uses a read-only recovery action for ambiguous state", () => {
    const { nodes, parking } = render("ambiguous");
    const check = action(nodes, "Check server state")!;
    (check.props.onPress as () => void)();
    expect(content(nodes)).toContain("Start Parking result is unknown");
    expect(parking.checkServerState).toHaveBeenCalledOnce();
    expect(parking.startParking).not.toHaveBeenCalled();
    expect(action(nodes, "Start Parking")).toBeUndefined();
  });

  it("presents conflict with canonical review instead of a protected retry", () => {
    const { nodes } = render("conflict");
    expect(content(nodes)).toContain("Parking work changed");
    expect(action(nodes, "Check server state")).toBeDefined();
    expect(action(nodes, "Start Parking")).toBeUndefined();
  });

  it.each([
    ["ambiguous", "نتيجة البدء غير معروفة"],
    ["conflict", "تغيرت مهمة الاصطفاف"],
  ] as const)("localizes the Arabic %s recovery state", (phase, expected) => {
    const { nodes } = render(phase, "ar");
    expect(content(nodes)).toContain(expected);
    expect(action(nodes, "تحقق من حالة الخادم")).toBeDefined();
  });

  it.each(["en", "ar"] as const)(
    "shows only the MOB-012A started boundary in %s",
    (locale) => {
      const { nodes } = render("started", locale);
      const text = content(nodes);
      expect(text).toContain(
        locale === "ar" ? "الاصطفاف قيد التنفيذ" : "Parking in progress",
      );
      expect(text).not.toMatch(
        /Confirm Parked|parking spot|key slot|تأكيد الاصطفاف|خانة المفتاح/i,
      );
    },
  );

  it("keeps the plate in an LTR identifier island under Arabic RTL", () => {
    const { nodes } = render("accepted", "ar");
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
});
