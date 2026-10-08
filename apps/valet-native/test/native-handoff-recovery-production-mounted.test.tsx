import type { EmployeeHandoffSnapshot } from "@valet/employee-client";
import { describe, expect, it, vi } from "vitest";
import {
  handoffRecoveryScope as scope,
  handoffRecoverySessionId as sessionId,
  handoffRecoverySnapshot as handoffSnapshot,
} from "./native-handoff-recovery-production-fixture";

const appearance = vi.hoisted(() => ({ mode: "light" as "light" | "dark" }));
vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: vi.fn(),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (value: unknown) => ({ current: value }),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    vi.fn(),
  ],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) => current(),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  AppState: { addEventListener: vi.fn() },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));
vi.mock("react-native-svg", () => ({ default: "Svg", Path: "Path", Rect: "Rect" }));
vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeePalettes } = await vi.importActual<
    typeof import("../src/appearance/employee-palette")
  >("../src/appearance/employee-palette");
  return {
    useEmployeePalette: () => employeePalettes[appearance.mode],
    useEmployeeStyles: <T,>(styles: Record<"dark" | "light", T>) =>
      styles[appearance.mode],
  };
});
vi.mock("../src/employee-ui/employee-frame", () => ({
  EmployeeAppHeader: () => null,
  EmployeeFrame: ({ children, direction }: { children: unknown; direction: string }) => ({
    type: "EmployeeFrame",
    props: { children, direction },
  }),
}));
vi.mock("../src/handoff/native-handoff-scanner", () => ({ NativeHandoffScanner: () => null }));
vi.mock("../src/handoff/native-handoff-reason-action", () => ({ NativeHandoffReasonAction: () => null }));
vi.mock("../src/guest-access/native-guest-access-clipboard", () => ({ copyNativeGuestAccessUrl: vi.fn() }));
vi.mock("../src/shift/native-active-shift-panel", () => ({ NativeActiveShiftPanel: () => null }));
vi.mock("../src/tasks/native-retrieval-attention", () => ({ NativeRetrievalAttention: () => null }));
vi.mock("../src/tasks/native-tasks-panel", () => ({ NativeTasksPanel: () => null }));
vi.mock("../src/tasks/native-new-vehicle-button", () => ({ NativeNewVehicleButton: () => null }));
vi.mock("../src/vehicles/native-vehicles-route", () => ({ NativeVehiclesRoute: () => null }));
vi.mock("../src/scan/native-scan-hub-screen", () => ({ NativeScanHubScreen: () => null }));
vi.mock("../src/shell/native-check-in-route", () => ({ NativeCheckInRoute: () => null }));
vi.mock("../src/parking/native-parking-start-panel", () => ({ NativeParkingStartPanel: () => null }));
vi.mock("../src/parking/native-parking-route", () => ({ NativeParkingRoute: () => null }));
vi.mock("../src/retrieval/native-retrieval-panel", () => ({ NativeRetrievalPanel: () => null }));
vi.mock("../src/handoff/native-release-panel", () => ({ NativeReleasePanel: () => null }));
vi.mock("../src/shell/native-active-header-utilities", () => ({ NativeActiveHeaderUtilities: () => null }));
vi.mock("../src/shell/native-production-navigation", () => ({ NativeProductionNavigation: () => null }));
vi.mock("../src/shell/native-connectivity-banner", () => ({ NativeConnectivityBanner: () => null }));
vi.mock("../src/tracking/native-task-tracking-status", () => ({ NativeTaskTrackingStatus: () => null }));

const { employeePalettes } = await import("../src/appearance/employee-palette");
const { NativeProductionWorkspace } = await import("../src/shell/native-production-workspace");
const { getNativeGuestAccessCopy } = await import("../src/guest-access/native-guest-access-copy");
const { content, elements } = await import("./native-check-in-condition-test-support");

function context(open = vi.fn()) {
  return {
    close: vi.fn(),
    guestAccess: {
      credentialFresh: false,
      error: null,
      expiresAt: null,
      mutation: null,
      phase: "inactive",
      revokedAt: null,
      status: null,
      target: null,
    },
    incident: { deadlineReached: false, detail: null, error: null, phase: "inactive", report: null, target: null },
    onSystemBack: () => false,
    open,
    route: null,
  };
}

function render(locale: "en" | "ar", handoff = handoffSnapshot(), contextual = context()) {
  const runtime = {
    auth: {},
    guestAccess: {
      freshCredentialUrl: () => null,
      hasValidCustomerOrigin: () => true,
      issue: vi.fn(),
      retry: vi.fn(),
      revoke: vi.fn(),
    },
    handoff: {
      abort: vi.fn(),
      checkServerState: vi.fn(),
      initiate: vi.fn(),
      override: vi.fn(),
      verifyDynamicQr: vi.fn(),
      verifyPickupCode: vi.fn(),
    },
    release: { release: vi.fn() },
    shiftEnd: { current: () => ({ phase: "ready" }) },
    taskTracking: {},
  };
  const tree = NativeProductionWorkspace({
    authSnapshot: { authGeneration: 3, phase: "authenticated" },
    confirmParking: {} as never,
    connectivity: "online",
    contextual: contextual as never,
    handoff,
    locale,
    navigate: vi.fn(),
    onSelectLocale: vi.fn(),
    operations: {} as never,
    parking: { phase: "inactive" } as never,
    push: { requestPermission: vi.fn(), snapshot: {} as never },
    release: { phase: "inactive" } as never,
    retrieval: { phase: "inactive" } as never,
    retrievalAttention: { attention: [], dismiss: vi.fn(), openCurrentTaskQueue: vi.fn() },
    runtime: runtime as never,
    shell: { destination: "retrieval", kind: "active", scope },
    vehicleDirectory: {} as never,
  });
  return { contextual, nodes: elements(tree), runtime };
}

function button(nodes: ReturnType<typeof elements>, label: string) {
  return nodes.find((node) => node.type === "Pressable" && node.props.accessibilityLabel === label);
}

function pressableStyle(node: NonNullable<ReturnType<typeof button>>) {
  const value = typeof node.props.style === "function"
    ? (node.props.style as (state: { pressed: boolean }) => unknown)({ pressed: false })
    : node.props.style;
  return Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
}

describe("T5 production composition mounted Handoff Guest Access recovery", () => {
  it.each([
    ["en", "ltr", "Guest Access"],
    ["ar", "rtl", "وصول الضيف"],
  ] as const)("mounts approved dark %s recovery without release bypass", (locale, direction, label) => {
    appearance.mode = "dark";
    const opened = vi.fn();
    const mounted = render(locale, handoffSnapshot(), context(opened));
    const action = button(mounted.nodes, label);
    expect(action).toBeDefined();
    expect(pressableStyle(action!)).toMatchObject({
      backgroundColor: employeePalettes.dark.surface,
      borderColor: employeePalettes.dark.border,
      borderWidth: 1,
    });
    expect(
      mounted.nodes.some(
        (node) =>
          node.type === "ScrollView" &&
          [node.props.contentContainerStyle].flat(Infinity).some(
            (entry) => (entry as { direction?: string })?.direction === direction,
          ),
      ),
    ).toBe(true);
    (action!.props.onPress as () => void)();
    expect(opened).toHaveBeenCalledWith("guest-access", "HANDOFF", sessionId);
    expect(mounted.runtime.handoff.verifyPickupCode).not.toHaveBeenCalled();
    expect(mounted.runtime.handoff.verifyDynamicQr).not.toHaveBeenCalled();
    expect(mounted.runtime.handoff.override).not.toHaveBeenCalled();
    expect(mounted.runtime.release.release).not.toHaveBeenCalled();
  });

  it.each([
    ["verified", (value: EmployeeHandoffSnapshot) => ({
      ...value,
      session: { ...value.session!, handoff: { ...value.session!.handoff, verification: { method: "PICKUP_CODE" as const, status: "VERIFIED" as const, verifiedAt: "2026-10-08T19:01:00.000Z" } } },
    })],
    ["wrong Location", (value: EmployeeHandoffSnapshot) => ({ ...value, session: { ...value.session!, locationId: "99999999-9999-4999-8999-999999999999" } })],
    ["stale Task", (value: EmployeeHandoffSnapshot) => ({ ...value, task: { ...value.task!, valetSessionVersion: 7 } })],
  ] as const)("hides recovery for %s production context", (_label, mutate) => {
    appearance.mode = "light";
    expect(button(render("en", mutate(handoffSnapshot())).nodes, "Guest Access")).toBeUndefined();
  });

  it("mounts the existing Arabic contextual Guest Access screen after routing", () => {
    appearance.mode = "dark";
    const contextual = context();
    contextual.route = { kind: "guest-access", origin: "HANDOFF", sessionId } as never;
    contextual.guestAccess = {
      ...contextual.guestAccess,
      phase: "ready",
      status: "NOT_ISSUED",
      target: { origin: "HANDOFF", sessionId },
    } as never;
    const mounted = render("ar", handoffSnapshot(), contextual);
    expect(content(mounted.nodes)).toContain(getNativeGuestAccessCopy("ar").title);
    expect(
      mounted.nodes.some(
        (node) =>
          node.type === "ScrollView" &&
          [node.props.contentContainerStyle].flat(Infinity).some(
            (entry) => (entry as { direction?: string })?.direction === "rtl",
          ),
      ),
    ).toBe(true);
    expect(button(mounted.nodes, "تسليم المركبة")).toBeUndefined();
  });
});
