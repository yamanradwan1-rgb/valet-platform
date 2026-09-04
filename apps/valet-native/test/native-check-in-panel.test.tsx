import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeCheckInSession,
  EmployeeOperationalSnapshot,
} from "@valet/employee-client";

const hooks = vi.hoisted(() => ({
  open: false,
  setOpen: vi.fn(),
  cleanups: [] as (() => void)[],
}));
vi.mock("react", () => ({
  useEffect: (effect: () => () => void) => hooks.cleanups.push(effect()),
  useState: () => [hooks.open, hooks.setOpen],
  useSyncExternalStore: (_subscribe: unknown, current: () => unknown) =>
    current(),
}));
vi.mock("react-native", () => ({
  Modal: "Modal",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));

const { NativeCheckInPanel } =
  await import("../src/check-in/native-check-in-panel");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

function checkIn() {
  return {
    activate: vi.fn(),
    clear: vi.fn(),
    current: () => ({ phase: "inactive" }),
    subscribe: () => vi.fn(),
  } as unknown as EmployeeCheckInSession;
}

function operations(
  phase: EmployeeOperationalSnapshot["phase"] = "ready",
): EmployeeOperationalSnapshot {
  return {
    contextFailure: null,
    identityGeneration: phase === "ready" ? 7 : null,
    mutation: { phase: "idle" },
    phase,
    queueFailure: null,
    queueLoading: false,
    scope:
      phase === "ready"
        ? {
            locationCode: "AMMAN",
            locationId: "11111111-1111-4111-8111-111111111111",
            locationName: "Amman",
            membershipId: "22222222-2222-4222-8222-222222222222",
            organizationId: "33333333-3333-4333-8333-333333333333",
            organizationName: "VAYLET",
            role: "VALET_EMPLOYEE",
            shiftId: "44444444-4444-4444-8444-444444444444",
            shiftStartedAt: "2026-09-04T08:00:00.000Z",
          }
        : null,
    tasks: [],
  };
}

describe("Native Check-In production entry", () => {
  it("purges transient state when the operational scope unmounts", () => {
    hooks.cleanups = [];
    const session = checkIn();
    NativeCheckInPanel({
      checkIn: session,
      locale: "en",
      operations: operations(),
    });
    hooks.cleanups[0]!();
    expect(session.clear).toHaveBeenCalledOnce();
  });
  it("is unavailable without an authorized active operational scope", () => {
    hooks.open = false;
    expect(
      NativeCheckInPanel({
        checkIn: checkIn(),
        locale: "en",
        operations: operations("no-active-shift"),
      }),
    ).toBeNull();
  });

  it("launches discovery for the authenticated generation and Location", () => {
    hooks.open = false;
    hooks.setOpen.mockClear();
    const session = checkIn();
    const nodes = elements(
      NativeCheckInPanel({
        checkIn: session,
        locale: "en",
        operations: operations(),
      }),
    );
    const launch = nodes.find(
      (node) => node.props.accessibilityLabel === "New vehicle check-in",
    )!;
    (launch.props.onPress as () => void)();
    expect(hooks.setOpen).toHaveBeenCalledWith(true);
    expect(session.activate).toHaveBeenCalledWith(
      7,
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("clears transient Check-In state before closing the Native modal", () => {
    hooks.open = true;
    hooks.setOpen.mockClear();
    const session = checkIn();
    const modal = elements(
      NativeCheckInPanel({
        checkIn: session,
        locale: "ar",
        operations: operations(),
      }),
    ).find((node) => node.type === "Modal")!;
    (modal.props.onRequestClose as () => void)();
    expect(session.clear).toHaveBeenCalledOnce();
    expect(hooks.setOpen).toHaveBeenCalledWith(false);
  });
});
