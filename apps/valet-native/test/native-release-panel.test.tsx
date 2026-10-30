import type { EmployeeReleaseSnapshot } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeReleasePanel } =
  await import("../src/handoff/native-release-panel");
const { content, elements, style } =
  await import("./native-check-in-condition-test-support");

const member = "22222222-2222-4222-8222-222222222222";
function snapshot(
  phase: EmployeeReleaseSnapshot["phase"],
  block: EmployeeReleaseSnapshot["block"] = null,
  method: "DYNAMIC_QR" | "PICKUP_CODE" | "SUPERVISOR_OVERRIDE" = "PICKUP_CODE",
): EmployeeReleaseSnapshot {
  return {
    block,
    completion: null,
    failure: null,
    identityGeneration: 9,
    phase,
    releaseRequiresPayment: block === "financial" ? true : false,
    releaseSatisfied: phase === "ready" || phase === "releasing",
    scope: {
      locationCode: "AMM",
      locationId: "11111111-1111-4111-8111-111111111111",
      locationName: "Amman",
      membershipId: member,
      organizationId: "33333333-3333-4333-8333-333333333333",
      organizationName: "Operator",
      role: "VALET_EMPLOYEE",
      shiftId: "55555555-5555-4555-8555-555555555555",
      shiftStartedAt: "2026-09-08T08:00:00.000Z",
    },
    session: {
      checkIn: { conditionCompletedAt: "2026-09-08T07:00:00.000Z" },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      handoff: {
        pendingAt: "2026-09-08T09:00:00.000Z",
        verification: {
          method,
          status: "VERIFIED",
          verifiedAt: "2026-09-08T09:01:00.000Z",
        },
      },
      keySlot: phase === "released" ? null : { code: "K-9" },
      locationId: "11111111-1111-4111-8111-111111111111",
      parking: {
        parkedAt: "2026-09-08T07:30:00.000Z",
        parkingSpotCode: null,
        parkingStartedAt: "2026-09-08T07:00:00.000Z",
        parkingZoneCode: null,
      },
      sessionId: "44444444-4444-4444-8444-444444444444",
      state: phase === "released" ? "COMPLETED" : "HANDOFF_PENDING",
      vehicle: {
        color: "Black",
        make: "Toyota",
        model: "Camry",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId: "77777777-7777-4777-8777-777777777777",
        vehicleUpdatedAt: "2026-09-08T07:00:00.000Z",
      },
      version: phase === "released" ? 9 : 8,
    },
    task:
      phase === "released"
        ? null
        : {
            createdAt: "2026-09-08T08:00:00.000Z",
            currentAssigneeMembershipId: member,
            parkingSpot: null,
            parkingZone: null,
            retrievalRequestedAt: "2026-09-08T08:00:00.000Z",
            sessionId: "44444444-4444-4444-8444-444444444444",
            status: "IN_PROGRESS",
            taskId: "66666666-6666-4666-8666-666666666666",
            taskType: "RETRIEVAL",
            valetSessionState: "HANDOFF_PENDING",
            valetSessionVersion: 8,
            vehicle: {
              color: "Black",
              make: "Toyota",
              model: "Camry",
              plateNumberRaw: "12-34567",
              temporaryDescriptor: null,
            },
            version: 4,
          },
  };
}

const release = { checkServerState: vi.fn(), release: vi.fn() };
function render(
  phase: EmployeeReleaseSnapshot["phase"],
  locale: "en" | "ar" = "en",
  block: EmployeeReleaseSnapshot["block"] = null,
  method: "DYNAMIC_QR" | "PICKUP_CODE" | "SUPERVISOR_OVERRIDE" = "PICKUP_CODE",
) {
  return elements(
    NativeReleasePanel({
      locale,
      onBack: vi.fn(),
      onDone: vi.fn(),
      release: release as never,
      snapshot: snapshot(phase, block, method),
    }),
  );
}

describe("MOB-014B Native final release", () => {
  it.each([
    ["en", "Identity verified · Pickup code", "Release Vehicle"],
    ["ar", "تم التحقق من الهوية · رمز الاستلام", "تسليم المركبة"],
  ] as const)(
    "shows one explicit final action in %s",
    (locale, verified, cta) => {
      const nodes = render("ready", locale);
      expect(content(nodes)).toContain(verified);
      expect(content(nodes)).toContain(cta);
      expect(
        nodes.filter(
          (node) =>
            node.type === "Pressable" && node.props.accessibilityLabel === cta,
        ),
      ).toHaveLength(1);
    },
  );

  it.each([
    ["DYNAMIC_QR", "Identity verified · Guest QR"],
    ["PICKUP_CODE", "Identity verified · Pickup code"],
    ["SUPERVISOR_OVERRIDE", "Supervisor override"],
  ] as const)("uses authoritative %s verification method", (method, label) => {
    expect(content(render("ready", "en", null, method))).toContain(label);
  });

  it("disables the sole Release action while releasing", () => {
    const nodes = render("releasing");
    const actions = nodes.filter(
      (node) => node.props.accessibilityLabel === "Releasing…",
    );
    expect(actions).toHaveLength(1);
    expect(actions[0]!.props.disabled).toBe(true);
  });

  it("invokes the bounded Report Issue callback with session context", () => {
    const onReportIssue = vi.fn();
    const snap = snapshot("ready");
    const nodes = elements(
      NativeReleasePanel({
        locale: "en",
        onBack: vi.fn(),
        onDone: vi.fn(),
        onReportIssue,
        release: release as never,
        snapshot: snap,
      }),
    );
    const action = nodes.find(
      (node) => node.props.accessibilityLabel === "Report Issue",
    )!;
    const resolved = (
      action.props.style as (state: { pressed: boolean }) => unknown
    )({ pressed: false });
    expect(
      Object.assign({}, ...[resolved].flat(Infinity).filter(Boolean)),
    ).toMatchObject({
      backgroundColor: "#FFFFFF",
      borderColor: "#DDE4EC",
      height: 56,
    });
    expect(
      style(nodes.find((node) => node.props.children === "Report Issue")!),
    ).toMatchObject({ color: "#07111F", fontWeight: "600" });
    (action.props.onPress as () => void)();
    expect(onReportIssue).toHaveBeenCalledWith(snap.session!.sessionId);
  });

  it("shows financial block without an operative release CTA", () => {
    const nodes = render("blocked", "en", "financial");
    expect(content(nodes)).toContain("Release blocked");
    expect(content(nodes)).not.toContain("Release Vehicle");
    expect(content(nodes)).not.toContain("Check server state");
  });

  it("uses RTL layout while keeping vehicle identifiers LTR", () => {
    const nodes = render("ready", "ar");
    expect(
      nodes.find((node) => node.type === "ScrollView")?.props
        .contentContainerStyle,
    ).toContainEqual({ direction: "rtl" });
    const plate = nodes.find(
      (node) => node.props.children === "Toyota Camry · 12-34567",
    )!;
    expect(style(plate)).toMatchObject({ writingDirection: "ltr" });
  });

  it("shows supervisor-not-owner authority block without Release", () => {
    const text = content(render("blocked", "en", "authority"));
    expect(text).toContain("Override recorded — awaiting task owner");
    expect(text).toContain("Retrieval task owner must complete");
    expect(text).not.toContain("Release Vehicle");
  });

  it.each(["releasing", "reconciling", "ambiguous"] as const)(
    "blocks software Back while %s is unresolved",
    (phase) => {
      const back = render(phase).find(
        (node) => node.props.accessibilityLabel === "Back",
      )!;
      expect(back.props.disabled).toBe(true);
    },
  );

  it("renders unknown outcome as read-only server reconciliation", () => {
    const nodes = render("ambiguous");
    expect(content(nodes)).toContain(
      "The operation failed. Refresh and try again.",
    );
    expect(content(nodes)).toContain("Retry");
    expect(content(nodes)).not.toContain("Release Vehicle");
  });

  it.each([
    [
      "en",
      "Handoff Complete",
      "Task completed and custody handed over.",
      "Next Task",
    ],
    [
      "ar",
      "اكتمل التسليم",
      "اكتملت المهمة وتم تسليم العهدة.",
      "المهمة التالية",
    ],
  ] as const)(
    "shows canonical completion and safe queue return in %s",
    (locale, title, body, done) => {
      const text = content(render("released", locale));
      expect(text).toContain(title);
      expect(text).toContain(body);
      expect(text).toContain(done);
      expect(text).not.toContain(
        locale === "en" ? "Release Vehicle" : "تسليم المركبة",
      );
    },
  );
});
