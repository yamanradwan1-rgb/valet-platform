import type { ReactElement } from "react";
import type {
  EmployeeShiftPresenceSession,
  PresenceSnapshot,
} from "@valet/employee-client";
import { expect, it, vi } from "vitest";
const appearance = vi.hoisted(() => ({ mode: "light" as "light" | "dark" }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initialize: () => unknown) => [initialize(), vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock("react-native", () => ({
  Text: "Text",
  View: "View",
  Pressable: "Pressable",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (value: unknown) => value },
}));
vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeePalettes } =
    await import("../src/appearance/employee-palette");
  return { useEmployeePalette: () => employeePalettes[appearance.mode] };
});
import { NativeShiftPresenceStatus } from "../src/shift/native-shift-presence-status";
import { getNativePresenceCopy } from "../src/shift/native-shift-presence-copy";
type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}
function render(
  phase: PresenceSnapshot["phase"],
  locale: "en" | "ar",
  mode: PresenceSnapshot["mode"] = "REQUIRE_OR_OVERRIDE",
) {
  const snapshot: PresenceSnapshot = {
    phase,
    mode,
    reason: null,
    summary: null,
    overrideReason: phase === "unavailable" ? "GPS_UNAVAILABLE" : null,
    retryAfter: null,
  };
  const owner = {
    snapshot: () => snapshot,
    requestManager: vi.fn(),
    checkStatus: vi.fn(),
    openSettings: vi.fn(),
    cancel: vi.fn(),
  };
  const onContinue = vi.fn();
  const onCancel = vi.fn();
  return {
    owner,
    onContinue,
    onCancel,
    nodes: elements(
      NativeShiftPresenceStatus({
        session: owner as unknown as EmployeeShiftPresenceSession,
        locale,
        onContinue,
        onCancel,
      }),
    ),
  };
}
it.each(["en", "ar"] as const)(
  "renders all presence phases accessibly in %s Light/Dark",
  (locale) => {
    for (const mode of ["light", "dark"] as const) {
      appearance.mode = mode;
      for (const phase of [
        "discovering",
        "acquiring",
        "submitting",
        "uncertain",
        "unavailable",
        "denied",
        "pending",
        "approved",
        "rejected",
        "expired",
      ] as const) {
        const s = render(phase, locale);
        const feedback = s.nodes.find(
          (node) => node.props.accessibilityLiveRegion === "polite",
        )!;
        expect(feedback.props.children).toBe(
          getNativePresenceCopy(locale)[phase],
        );
        expect(JSON.stringify(feedback.props.style)).toContain(
          locale === "ar" ? '"textAlign":"right"' : '"textAlign":"left"',
        );
        expect(feedback.props.accessibilityState).toEqual({
          busy: ["discovering", "acquiring", "submitting"].includes(phase),
        });
        expect(s.owner.requestManager).not.toHaveBeenCalled();
        expect(s.onContinue).not.toHaveBeenCalled();
      }
    }
  },
);
it("OFF and confirmed states introduce no feedback or actions", () => {
  expect(render("acquiring", "en", "OFF").nodes).toEqual([]);
  expect(render("confirmed", "en").nodes).toEqual([]);
  expect(render("denied", "en", "OFF").nodes).not.toEqual([]);
});
it("manager and approved continuation require separate explicit presses", () => {
  const pending = render("pending", "en");
  expect(
    pending.nodes.some((node) => node.props.label === "Continue Shift action"),
  ).toBe(false);
  const approved = render("approved", "en");
  (
    approved.nodes.find((node) => node.props.label === "Continue Shift action")!
      .props.onPress as () => void
  )();
  expect(approved.onContinue).toHaveBeenCalledOnce();
  const unavailable = render("unavailable", "ar");
  (
    unavailable.nodes.find(
      (node) => node.props.label === getNativePresenceCopy("ar").manager,
    )!.props.onPress as () => void
  )();
  expect(unavailable.owner.requestManager).toHaveBeenCalledOnce();
});
it("pre-POST Cancel retires parent presentation and acquisition", () => {
  const acquiring = render("acquiring", "en");
  (
    acquiring.nodes.find(
      (node) => node.props.label === "Cancel location check",
    )!.props.onPress as () => void
  )();
  expect(acquiring.onCancel).toHaveBeenCalledOnce();
  expect(acquiring.owner.cancel).toHaveBeenCalledOnce();
  expect(
    render("submitting", "en").nodes.some(
      (node) => node.props.label === "Cancel location check",
    ),
  ).toBe(false);
});
