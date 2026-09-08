import type { EmployeeHandoffSnapshot } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: vi.fn(),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  AppState: { addEventListener: vi.fn() },
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

const { NativeHandoffPanel } =
  await import("../src/handoff/native-handoff-panel");
const { content, elements, style } =
  await import("./native-check-in-condition-test-support");

const member = "22222222-2222-4222-8222-222222222222";
const other = "99999999-9999-4999-8999-999999999999";
function snapshot(
  phase: EmployeeHandoffSnapshot["phase"],
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
  owner = true,
): EmployeeHandoffSnapshot {
  return {
    failure: null,
    identityGeneration: 9,
    phase,
    scope: {
      locationCode: "AMM",
      locationId: "11111111-1111-4111-8111-111111111111",
      locationName: "Amman",
      membershipId: member,
      organizationId: "33333333-3333-4333-8333-333333333333",
      organizationName: "Operator",
      role,
      shiftId: "55555555-5555-4555-8555-555555555555",
      shiftStartedAt: "2026-09-08T08:00:00.000Z",
    },
    session: {
      checkIn: { conditionCompletedAt: "2026-09-08T07:00:00.000Z" },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      handoff:
        phase === "ready"
          ? { pendingAt: null, verification: null }
          : {
              pendingAt: "2026-09-08T09:00:00.000Z",
              verification:
                phase === "verified"
                  ? {
                      method: "PICKUP_CODE",
                      status: "VERIFIED",
                      verifiedAt: "2026-09-08T09:01:00.000Z",
                    }
                  : null,
            },
      keySlot: { code: "K-9" },
      locationId: "11111111-1111-4111-8111-111111111111",
      parking: {
        parkedAt: "2026-09-08T07:30:00.000Z",
        parkingSpotCode: null,
        parkingStartedAt: "2026-09-08T07:00:00.000Z",
        parkingZoneCode: null,
      },
      sessionId: "44444444-4444-4444-8444-444444444444",
      state: phase === "ready" ? "READY" : "HANDOFF_PENDING",
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
      version: phase === "ready" ? 7 : 8,
    },
    task: {
      createdAt: "2026-09-08T08:00:00.000Z",
      currentAssigneeMembershipId: owner ? member : other,
      parkingSpot: null,
      parkingZone: null,
      retrievalRequestedAt: "2026-09-08T08:00:00.000Z",
      sessionId: "44444444-4444-4444-8444-444444444444",
      status: "IN_PROGRESS",
      taskId: "66666666-6666-4666-8666-666666666666",
      taskType: "RETRIEVAL",
      valetSessionState: phase === "ready" ? "READY" : "HANDOFF_PENDING",
      valetSessionVersion: phase === "ready" ? 7 : 8,
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

const handoff = {
  abort: vi.fn(),
  checkServerState: vi.fn(),
  initiate: vi.fn(),
  override: vi.fn(),
  verifyDynamicQr: vi.fn(),
  verifyPickupCode: vi.fn(),
};
function render(
  phase: EmployeeHandoffSnapshot["phase"],
  locale: "en" | "ar" = "en",
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
  owner = true,
) {
  return elements(
    NativeHandoffPanel({
      auth: {} as never,
      handoff: handoff as never,
      locale,
      onBack: vi.fn(),
      snapshot: snapshot(phase, role, owner),
    }),
  );
}

describe("MOB-014A Native secure handoff", () => {
  it("starts from READY with one dominant Begin Guest Handoff action", () => {
    const nodes = render("ready");
    expect(content(nodes)).toContain("Begin Guest Handoff");
    expect(content(nodes)).not.toMatch(/complete|release vehicle/i);
  });
  it("offers LTR four-digit and Dynamic QR inputs only to the current owner", () => {
    const nodes = render("pending", "ar");
    const inputs = nodes.filter((node) => node.type === "TextInput");
    expect(
      inputs.some(
        (node) =>
          node.props.keyboardType === "number-pad" &&
          node.props.maxLength === 4,
      ),
    ).toBe(true);
    expect(inputs.some((node) => style(node).writingDirection === "ltr")).toBe(
      true,
    );
    expect(content(nodes)).toContain("التحقق لا يعني تحرير المركبة");
  });
  it("shows non-owner supervisor override without Standard proof controls", () => {
    const nodes = render("pending", "en", "VALET_SUPERVISOR", false);
    expect(content(nodes)).toContain("Authorize supervisor override");
    expect(nodes.some((node) => node.props.keyboardType === "number-pad")).toBe(
      false,
    );
  });
  it.each(["en", "ar"] as const)(
    "stops verified proof before release in %s",
    (locale) => {
      const text = content(render("verified", locale));
      expect(text).toContain(
        locale === "en"
          ? "The vehicle has not been released or completed."
          : "لم يتم تحرير المركبة أو إكمال المهمة.",
      );
      expect(text).not.toMatch(
        /complete handoff|release vehicle|إكمال التسليم/iu,
      );
    },
  );
  it("blocks software Back during protected verification", () => {
    const back = render("verifying").find(
      (node) => node.props.accessibilityLabel === "Back",
    )!;
    expect(back.props.disabled).toBe(true);
  });
});
