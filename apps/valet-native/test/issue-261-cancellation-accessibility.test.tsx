import { describe, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  index: 0,
  effects: [] as (() => void)[],
  focus: vi.fn(),
  announce: vi.fn(),
}));
vi.mock("react", () => ({
  useState: (value: () => unknown) => [value(), vi.fn()],
  useRef: (value: unknown) =>
    hooks.refs[hooks.index++] ??
    (hooks.refs[hooks.index - 1] = { current: value }),
  useEffect: (effect: () => void) => hooks.effects.push(effect),
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    setAccessibilityFocus: hooks.focus,
    announceForAccessibility: hooks.announce,
  },
  findNodeHandle: () => 261,
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Pressable: "Pressable",
  View: "View",
  Text: "Text",
  useWindowDimensions: () => ({ fontScale: 1 }),
  StyleSheet: { create: (value: unknown) => value },
}));
const { NativeParkingCancellationControls } =
  await import("../src/parking/native-parking-cancellation-controls");
const { elements } = await import("./native-check-in-condition-test-support");
describe("Issue #261 focus and recovery announcements", () => {
  it("moves focus into confirmation, returns it after dismissal, and announces uncertainty/conflict", () => {
    let phase = "confirming";
    const session = {
      current: () => ({ phase, target: null }),
      subscribe: vi.fn(),
      dismiss: vi.fn(),
    };
    const props = {
      session: session as never,
      parking: {
        phase: "accepted",
        task: {},
        session: {
          state: "AWAITING_PARKING",
          parking: { parkingStartedAt: null },
        },
      } as never,
      locale: "en" as const,
      onCancelled: vi.fn(),
      onBack: vi.fn(),
    };
    hooks.refs = [];
    hooks.index = 0;
    hooks.effects = [];
    const nodes = elements(NativeParkingCancellationControls(props));
    hooks.refs[1]!.current = {};
    (nodes.find((n) => n.type === "Modal")!.props.onShow as () => void)();
    expect(hooks.focus).toHaveBeenCalledWith(261);
    hooks.effects.forEach((effect) => effect());
    phase = "idle";
    hooks.index = 0;
    hooks.effects = [];
    elements(NativeParkingCancellationControls(props));
    hooks.refs[0]!.current = {};
    hooks.effects.forEach((effect) => effect());
    expect(hooks.focus).toHaveBeenCalledTimes(2);
    for (const next of ["uncertain", "conflict"]) {
      phase = next;
      hooks.index = 0;
      hooks.effects = [];
      elements(NativeParkingCancellationControls(props));
      hooks.effects.forEach((effect) => effect());
    }
    expect(hooks.announce).toHaveBeenCalledWith(
      expect.stringContaining("unknown"),
    );
    expect(hooks.announce).toHaveBeenCalledWith(
      expect.stringContaining("no longer"),
    );
  });
});
