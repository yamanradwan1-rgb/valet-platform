import type { ReactElement } from "react";
import { vi } from "vitest";

// Run effect setup/cleanup and rerenders on state changes in the repository's
// host-element Native tests. This is simulated lifecycle, not device proof.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  render: () => undefined as void,
  states: [] as unknown[],
  effects: [] as {
    dependencies: readonly unknown[];
    cleanup?: (() => void) | undefined;
  }[],
  pending: [] as (() => void)[],
}));
const lifecycle = vi.hoisted(() => ({
  state: "active",
  listeners: new Set<(state: string) => void>(),
  remove: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.states)) {
      hooks.states[index] = typeof initial === "function" ? initial() : initial;
    }
    return [
      hooks.states[index],
      (next: unknown) => {
        hooks.states[index] = next;
        hooks.render();
      },
    ];
  },
  useEffect: (
    effect: () => (() => void) | undefined,
    dependencies: readonly unknown[],
  ) => {
    const index = hooks.cursor++;
    const previous = hooks.effects[index];
    if (
      previous &&
      dependencies.every((value, i) =>
        Object.is(value, previous.dependencies[i]),
      )
    )
      return;
    hooks.pending.push(() => {
      previous?.cleanup?.();
      hooks.effects[index] = { dependencies, cleanup: effect() };
    });
  },
}));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return lifecycle.state;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      lifecycle.listeners.add(listener);
      return {
        remove: () => {
          lifecycle.listeners.delete(listener);
          lifecycle.remove();
        },
      };
    },
  },
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

export const { NativeTaskShiftStrip } =
  await import("../src/tasks/native-task-shift-strip");
export type StripProps = Parameters<typeof NativeTaskShiftStrip>[0];
export type Element = ReactElement<Record<string, unknown>>;

export function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

export function style(value: unknown): Record<string, unknown> {
  return Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
}

export function mountStrip(initial: StripProps) {
  let props = initial;
  let nodes: Element[] = [];
  hooks.render = () => {
    hooks.cursor = 0;
    nodes = elements(NativeTaskShiftStrip(props));
    hooks.pending.splice(0).forEach((setup) => setup());
  };
  hooks.render();
  return {
    nodes: () => nodes,
    text: () =>
      nodes
        .filter((node) => node.type === "Text")
        .map((node) => node.props.children)
        .join(""),
    update: (next: StripProps) => {
      props = next;
      hooks.render();
    },
    unmount: () => {
      hooks.effects.forEach((effect) => effect.cleanup?.());
      hooks.effects = [];
      hooks.render = () => undefined;
    },
  };
}

export function resetStripFixture() {
  hooks.cursor = 0;
  hooks.states = [];
  hooks.effects = [];
  hooks.pending = [];
  lifecycle.state = "active";
  lifecycle.listeners.clear();
  lifecycle.remove.mockClear();
}

export function setStripAppState(state: "active" | "background" | "inactive") {
  lifecycle.state = state;
  lifecycle.listeners.forEach((listener) => listener(state));
}

export const stripLifecycle = lifecycle;
