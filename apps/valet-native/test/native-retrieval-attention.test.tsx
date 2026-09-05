import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  index: 0,
  values: [] as unknown[],
}));

vi.mock("react", () => ({
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

const { NativeRetrievalAttention } =
  await import("../src/tasks/native-retrieval-attention");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

const taskId = "66666666-6666-4666-8666-666666666666";

function render(taskIds: readonly string[]) {
  hooks.index = 0;
  return elements(
    NativeRetrievalAttention({
      locale: "en",
      onDismiss,
      onOpenQueue,
      operations,
      taskIds,
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
  onDismiss = vi.fn();
  onOpenQueue = vi.fn();
  operations = { refreshQueue: vi.fn(() => Promise.resolve()) };
});

describe("Native foreground retrieval attention", () => {
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

    expect(onDismiss).toHaveBeenCalledWith(taskId);
  });

  it("refreshes canonical queue state before opening Tasks", async () => {
    let resolveRefresh: (() => void) | undefined;
    operations.refreshQueue = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const visible = render([taskId]);
    const message = visible.find((node) =>
      String(node.props.accessibilityLabel).startsWith("Vehicle requested"),
    )!;

    (message.props.onPress as () => void)();
    expect(operations.refreshQueue).toHaveBeenCalledOnce();
    expect(onOpenQueue).not.toHaveBeenCalled();
    resolveRefresh?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(onDismiss).toHaveBeenCalledWith(taskId);
    expect(onOpenQueue).toHaveBeenCalledOnce();
  });
});
