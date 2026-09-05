import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  index: 0,
  refIndex: 0,
  refs: [] as Array<{ current: unknown }>,
  values: [] as unknown[],
}));

vi.mock("react", () => ({
  useEffect: (effect: () => void) => effect(),
  useRef: (initial: unknown) => {
    const index = hooks.refIndex++;
    hooks.refs[index] ??= { current: initial };
    return hooks.refs[index];
  },
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
const { operations: snapshotFixture } =
  await import("./production-shell-test-fixture");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

const retrieval = {
  createdAt: "2026-09-03T08:05:00.000Z",
  currentAssigneeMembershipId: null,
  parkingSpot: "12",
  parkingZone: "North",
  retrievalRequestedAt: "2026-09-03T08:10:00.000Z",
  sessionId: "44444444-4444-4444-8444-444444444444",
  status: "QUEUED" as const,
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "RETRIEVAL" as const,
  valetSessionState: "REQUESTED" as const,
  valetSessionVersion: 2,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
  version: 3,
};

function render(count: number, tasks: readonly [typeof retrieval] | []) {
  hooks.index = 0;
  hooks.refIndex = 0;
  return elements(
    NativeRetrievalAttention({
      locale: "en",
      onOpenQueue,
      operations,
      snapshot: {
        ...snapshotFixture("ready"),
        successfulQueueSnapshotCount: count,
        tasks,
      },
      textAlign: "left",
    }),
  );
}

let onOpenQueue: ReturnType<typeof vi.fn>;
let operations: { refreshQueue: ReturnType<typeof vi.fn> };

beforeEach(() => {
  hooks.index = 0;
  hooks.refIndex = 0;
  hooks.refs = [];
  hooks.values = [];
  onOpenQueue = vi.fn();
  operations = { refreshQueue: vi.fn(() => Promise.resolve()) };
});

describe("Native foreground retrieval attention", () => {
  it("shows only after baseline and dismissal prevents replay", () => {
    expect(render(1, [])).toEqual([]);
    expect(render(2, [retrieval])).toEqual([]);
    const visible = render(2, [retrieval]);
    const dismiss = visible.find(
      (node) => node.props.accessibilityLabel === "Dismiss",
    )!;

    (dismiss.props.onPress as () => void)();

    expect(render(2, [retrieval])).toEqual([]);
    expect(render(3, [retrieval])).toEqual([]);
  });

  it("refreshes canonical queue state before opening Tasks", async () => {
    let resolveRefresh: (() => void) | undefined;
    operations.refreshQueue = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    render(1, []);
    render(2, [retrieval]);
    const visible = render(2, [retrieval]);
    const message = visible.find((node) =>
      String(node.props.accessibilityLabel).startsWith("Retrieval requested"),
    )!;

    (message.props.onPress as () => void)();
    expect(operations.refreshQueue).toHaveBeenCalledOnce();
    expect(onOpenQueue).not.toHaveBeenCalled();
    resolveRefresh?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(onOpenQueue).toHaveBeenCalledOnce();
  });
});
