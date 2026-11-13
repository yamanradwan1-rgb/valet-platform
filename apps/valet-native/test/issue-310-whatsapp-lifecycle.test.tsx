import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeAppearanceOwner } from "../src/appearance/native-appearance-owner";

type Effect = { deps: readonly unknown[]; cleanup?: () => void };
const hooks = vi.hoisted(() => ({
  owner: undefined as unknown as NativeAppearanceOwner,
  refs: [] as { current: unknown }[],
  effects: [] as Effect[],
  pending: [] as (() => void)[],
  refIndex: 0,
  effectIndex: 0,
  state: undefined as unknown,
}));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useRef: (value: unknown) =>
    (hooks.refs[hooks.refIndex++] ??= { current: value }),
  useState: (value: unknown) => [
    (hooks.state ??= value),
    (next: unknown) => (hooks.state = next),
  ],
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const index = hooks.effectIndex++;
    const old = hooks.effects[index];
    if (old && deps.every((value, i) => Object.is(value, old.deps[i]))) return;
    hooks.pending.push(() => {
      old?.cleanup?.();
      hooks.effects[index] = { deps, cleanup: effect() || undefined };
    });
  },
}));
vi.mock("react-native", () => ({ ScrollView: "ScrollView", View: "View" }));
vi.mock("../src/appearance/employee-appearance-context", () => ({
  useEmployeeAppearance: () => ({
    palette: { mode: hooks.owner.current().mode },
    ready: hooks.owner.current().ready,
    select: hooks.owner.select,
  }),
  useEmployeeStyles: () => ({ body: {} }),
}));
vi.mock("../src/check-in/native-check-in-parking-task-step", () => ({
  NativeCheckInParkingTaskStep: "ParkingTask",
}));
vi.mock("../src/check-in/native-check-in-primitives", () => ({
  CheckInHeader: "CheckInHeader",
}));
vi.mock("../src/check-in/native-check-in-styles", () => ({
  checkInStylesTheme: {},
}));
vi.mock("../src/employee-ui/employee-frame", () => ({
  EmployeeAppHeader: "EmployeeAppHeader",
  EmployeeFrame: "EmployeeFrame",
}));
vi.mock("../src/shell/native-active-header-utilities", () => ({
  NativeActiveHeaderUtilities: "NativeActiveHeaderUtilities",
}));
vi.mock("../src/shell/native-production-navigation", () => ({
  NativeProductionNavigation: "NativeProductionNavigation",
}));
vi.mock("../src/prototypes/whatsapp/native-whatsapp-prototype-button", () => ({
  NativeWhatsAppPrototypeButton: "DemoButton",
}));
const { NativeWhatsAppPrototypeScreen } =
  await import("../src/prototypes/whatsapp/native-whatsapp-prototype-screen");

type Props = Parameters<typeof NativeWhatsAppPrototypeScreen>[0];
type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}
function render(changes: Partial<Props> = {}) {
  hooks.refIndex = 0;
  hooks.effectIndex = 0;
  const entry = NativeWhatsAppPrototypeScreen({
    baseline: false,
    initialState: "default",
    locale: "en",
    theme: "dark",
    onBack: () => {},
    ...changes,
  });
  const tree = entry
    ? (entry.type as (props: Props) => Element)(entry.props)
    : null;
  hooks.pending.splice(0).forEach((effect) => effect());
  return tree;
}

afterEach(() => {
  hooks.effects.forEach((effect) => effect.cleanup?.());
  hooks.refs = [];
  hooks.effects = [];
  hooks.pending = [];
  hooks.state = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Issue #310 preview session lifecycle", () => {
  it("waits for appearance restoration before capturing the prior preference", async () => {
    vi.stubGlobal("__DEV__", true);
    hooks.owner = new NativeAppearanceOwner({
      read: async () => null,
      write: vi.fn(),
    });
    expect(render()).toBeNull();
    await hooks.owner.restore();
    expect(render()).not.toBeNull();
    expect(hooks.owner.current().mode).toBe("dark");
  });

  it("restores the original persisted theme after variant/theme changes and cancels old demo work", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.useFakeTimers();
    const write = vi.fn(async (_value: string) => {});
    hooks.owner = new NativeAppearanceOwner({ read: async () => null, write });
    await hooks.owner.restore();
    let tree = render();
    expect(hooks.owner.current().mode).toBe("dark");
    const parking = elements(tree).find((node) => node.type === "ParkingTask")!;
    const button = parking.props.whatsAppPrototype as Element;
    (button.props.onAdvance as () => void)();
    expect(hooks.state).toBe("loading");
    render({ initialState: "accepted" });
    expect(hooks.state).toBe("accepted");
    await vi.advanceTimersByTimeAsync(1000);
    expect(hooks.state).toBe("accepted");
    render({ theme: "light", initialState: "delivered" });
    expect(hooks.owner.current().mode).toBe("light");
    tree = render({ initialState: "disabled" });
    expect(tree).not.toBeNull();
    expect(hooks.owner.current().mode).toBe("dark");
    hooks.effects.forEach((effect) => effect.cleanup?.());
    await hooks.owner.settled();
    expect(hooks.owner.current().mode).toBe("light");
    expect(JSON.parse(write.mock.calls.at(-1)![0]).theme).toBe("light");
  });
});
