import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  index: 0,
  values: [] as unknown[],
}));
const gestures = vi.hoisted(() => ({
  end: undefined as
    | ((event: { translationX: number; translationY: number }) => void)
    | undefined,
  update: undefined as
    | ((event: { translationX: number; translationY: number }) => void)
    | undefined,
}));

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (next: unknown) => {
        hooks.values[index] =
          typeof next === "function"
            ? (next as (value: unknown) => unknown)(hooks.values[index])
            : next;
      },
    ];
  },
}));

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));
vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: () => {
      const chain = {
        onEnd(callback: typeof gestures.end) {
          gestures.end = callback;
          return chain;
        },
        onFinalize() {
          return chain;
        },
        onUpdate(callback: typeof gestures.update) {
          gestures.update = callback;
          return chain;
        },
      };
      return chain;
    },
  },
  GestureDetector: "GestureDetector",
  GestureHandlerRootView: "GestureHandlerRootView",
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: "AnimatedView" },
  ReduceMotion: { System: "system" },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: unknown) => ({ value }),
  withDelay: (_delay: number, value: unknown) => value,
  withTiming: (value: unknown) => value,
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (callback: () => void) => callback(),
}));

const { NativeRetrievalAttention } =
  await import("../src/tasks/native-retrieval-attention");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function")
    return elements((node.type as (props: unknown) => unknown)(node.props));
  return [node, ...elements(node.props.children)];
}

const taskId = "66666666-6666-4666-8666-666666666666";

function render(taskIds: readonly string[]) {
  hooks.index = 0;
  return elements(
    NativeRetrievalAttention({
      attention: taskIds.map((key) => ({ key, source: "polling" as const })),
      locale: "en",
      onDismiss,
      onOpenQueue,
      operations,
      textAlign: "left",
    }),
  );
}

function renderPush(intentId: string) {
  hooks.index = 0;
  return elements(
    NativeRetrievalAttention({
      attention: [{ key: intentId, source: "push" }],
      locale: "en",
      onDismiss,
      onOpenQueue,
      operations,
      textAlign: "left",
    }),
  );
}

let onOpenQueue: ReturnType<typeof vi.fn>;
let onDismiss: ReturnType<typeof vi.fn>;
let operations: { refreshQueue: ReturnType<typeof vi.fn> };

beforeEach(() => {
  hooks.index = 0;
  hooks.values = [];
  gestures.end = undefined;
  gestures.update = undefined;
  onDismiss = vi.fn();
  onOpenQueue = vi.fn();
  operations = { refreshQueue: vi.fn(() => Promise.resolve()) };
});

describe("Native foreground retrieval attention", () => {
  it("renders no overlay for zero alerts", () => {
    expect(render([])).toEqual([]);
  });

  it("renders exact Web copy and delegates dismissal to the shell owner", () => {
    const visible = render([taskId]);
    const dismiss = visible.find(
      (node) => node.props.accessibilityLabel === "Dismiss",
    )!;
    expect(
      JSON.stringify(visible.map((node) => node.props.children)),
    ).toContain("Vehicle requested");
    expect(
      JSON.stringify(visible.map((node) => node.props.children)),
    ).toContain("A guest has requested their vehicle.");

    (dismiss.props.onPress as () => void)();

    expect(onDismiss).toHaveBeenCalledWith({ key: taskId, source: "polling" });
  });

  it("opens Tasks immediately without waiting for canonical refresh", () => {
    operations.refreshQueue = vi.fn(() => new Promise<void>(() => undefined));
    const visible = render([taskId]);
    const message = visible.find((node) =>
      String(node.props.accessibilityLabel).startsWith("Vehicle requested"),
    )!;

    (message.props.onPress as () => void)();
    expect(operations.refreshQueue).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith({ key: taskId, source: "polling" });
    expect(onOpenQueue).toHaveBeenCalledOnce();
  });

  it("opens and refetches the canonical queue for push attention", () => {
    const intentId = "77777777-7777-4777-8777-777777777777";
    const visible = renderPush(intentId);
    const message = visible.find((node) =>
      String(node.props.accessibilityLabel).startsWith("Vehicle requested"),
    )!;

    (message.props.onPress as () => void)();

    expect(onDismiss).toHaveBeenCalledExactlyOnceWith({
      key: intentId,
      source: "push",
    });
    expect(onOpenQueue).toHaveBeenCalledOnce();
    expect(operations.refreshQueue).toHaveBeenCalledOnce();
  });

  it.each([2, 3])(
    "renders %i simultaneous alerts in stable task order",
    (count) => {
      const ids = Array.from(
        { length: count },
        (_, index) => `${taskId}-${index}`,
      );
      const visible = render(ids);
      expect(
        visible
          .filter((node) => node.props.testID === "native-retrieval-alert")
          .map((node) => node.props.testID),
      ).toEqual(ids.map(() => "native-retrieval-alert"));
    },
  );

  it("dismisses exactly the swiped alert at the Web threshold", () => {
    render([taskId]);
    gestures.update?.({ translationX: 4, translationY: -48 });
    gestures.end?.({ translationX: 4, translationY: -48 });
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith({
      key: taskId,
      source: "polling",
    });
    expect(onOpenQueue).not.toHaveBeenCalled();
  });

  it("uses exact Arabic copy without reversing logical task order", () => {
    hooks.index = 0;
    const ids = [`${taskId}-a`, `${taskId}-b`];
    const visible = elements(
      NativeRetrievalAttention({
        attention: ids.map((key) => ({ key, source: "polling" as const })),
        locale: "ar",
        onDismiss,
        onOpenQueue,
        operations: operations as never,
        textAlign: "right",
      }),
    );
    expect(
      visible.some((node) => node.props.accessibilityLabel === "تجاهل"),
    ).toBe(true);
    expect(
      visible
        .filter((node) => node.props.testID === "native-retrieval-alert")
        .map((node) => node.props.testID),
    ).toEqual(ids.map(() => "native-retrieval-alert"));
  });
});
