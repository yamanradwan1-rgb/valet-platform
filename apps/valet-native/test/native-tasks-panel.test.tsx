import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useRef: <T,>(value: T) => ({ current: value }),
    useState: <T,>(value: T) => [value, vi.fn()],
  };
});
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  FlatList: "FlatList",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeTasksPanel } = await import("../src/tasks/native-tasks-panel");
const { NativeTaskCard } = await import("../src/tasks/native-task-card");
const { NativeTaskQueueRow } =
  await import("../src/tasks/native-task-queue-row");
const { NativeTaskShiftStrip } =
  await import("../src/tasks/native-task-shift-strip");
const { NativeManualRefreshButton } =
  await import("../src/tasks/native-manual-refresh-button");
const { EmployeeButton } = await import("../src/employee-ui/employee-controls");
const { operations: fixture } = await import("./production-shell-test-fixture");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

const task = {
  createdAt: "2026-09-03T08:05:00.000Z",
  currentAssigneeMembershipId: null,
  parkingSpot: null,
  parkingZone: null,
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

function render(tasks = [task]) {
  return elements(
    NativeTasksPanel({
      locale: "en",
      operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
      snapshot: { ...fixture("ready"), tasks },
      textAlign: "left",
    }),
  );
}

describe("Web-authoritative Native Tasks screen", () => {
  it("owns a full-width shift strip outside the padded main content", () => {
    const nodes = render();
    const strip = nodes.find((node) => node.type === NativeTaskShiftStrip)!;
    expect(strip.props).toMatchObject({
      activeLabel: "Shift active",
      nowLabel: "now",
    });
    const root = nodes[0]!;
    expect((root.props.children as Element[])[0]?.type).toBe(
      NativeTaskShiftStrip,
    );
  });

  it("uses a 24px task title and has no visible manual Refresh control", () => {
    const nodes = render();
    expect(nodes.some((node) => node.props.children === "Tasks")).toBe(true);
    expect(nodes.some((node) => node.type === NativeManualRefreshButton)).toBe(
      false,
    );
    expect(
      nodes.some(
        (node) =>
          node.type === EmployeeButton && node.props.label === "Refresh",
      ),
    ).toBe(false);
    const unavailable = elements(
      NativeTasksPanel({
        locale: "en",
        operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
        snapshot: {
          ...fixture("ready"),
          phase: "no-active-shift",
          scope: null,
          tasks: [],
        },
        textAlign: "left",
      }),
    );
    expect(unavailable.some((node) => node.type === EmployeeButton)).toBe(
      false,
    );
    const heading = nodes.find(
      (node) => node.props.accessibilityRole === "header",
    )!;
    expect(JSON.stringify(heading.props.style)).toContain('"fontSize":24');
  });

  it("renders one priority card and natural queue rows under the Queue label", () => {
    const second = { ...task, taskId: "77777777-7777-4777-8777-777777777777" };
    const nodes = render([task, second]);
    expect(nodes.some((node) => node.type === NativeTaskCard)).toBe(true);
    const list = nodes.find((node) => node.type === "FlatList")!;
    expect(list.props.data).toEqual([second]);
    const row = (
      list.props.renderItem as (input: { item: typeof task }) => Element
    )({ item: second });
    expect(row.type).toBe(NativeTaskQueueRow);
  });

  it("retains a verified queue during same-authority refresh", () => {
    const nodes = elements(
      NativeTasksPanel({
        locale: "en",
        operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
        snapshot: { ...fixture("ready"), queueRefreshing: true, tasks: [task] },
        textAlign: "left",
      }),
    );
    expect(nodes.some((node) => node.type === NativeTaskCard)).toBe(true);
  });

  it("prevents duplicate task actions while the first action is in flight", async () => {
    let finish!: (value: boolean) => void;
    const action = vi.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    const nodes = elements(
      NativeTasksPanel({
        locale: "en",
        onTaskAction: action,
        operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
        snapshot: { ...fixture("ready"), tasks: [task] },
        textAlign: "left",
      }),
    );
    const card = nodes.find((node) => node.type === NativeTaskCard)!;
    (card.props.onAction as () => void)();
    (card.props.onAction as () => void)();
    expect(action).toHaveBeenCalledOnce();
    finish(true);
    await Promise.resolve();
  });
});
