import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

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
const { NativeManualRefreshButton } =
  await import("../src/tasks/native-manual-refresh-button");
const { NativeTaskQueueRow } =
  await import("../src/tasks/native-task-queue-row");
const { EmployeeButton } = await import("../src/employee-ui/employee-controls");
const { EmployeeError, EmployeeStatus } =
  await import("../src/employee-ui/employee-feedback");
const { operations: snapshotFixture } =
  await import("./production-shell-test-fixture");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

const operations = { refresh: vi.fn(), refreshQueue: vi.fn() } as never;
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

function render(overrides = {}) {
  return elements(panel(overrides));
}

function panel(overrides = {}, locale: "en" | "ar" = "en") {
  const snapshot = { ...snapshotFixture("ready"), ...overrides };
  return NativeTasksPanel({
    locale,
    operations,
    snapshot,
    textAlign: locale === "ar" ? "right" : "left",
  }) as Element;
}

function directElements(node: Element): Element[] {
  const children = Array.isArray(node.props.children)
    ? node.props.children
    : [node.props.children];
  return children.filter(
    (child): child is Element =>
      child !== null && typeof child === "object" && "props" in child,
  );
}

describe("Native production Tasks panel", () => {
  it("renders a virtualized canonical queue for large-list safety", () => {
    const list = render({ tasks: [task] }).find(
      (node) => node.type === "FlatList",
    )!;
    expect(list.props).toMatchObject({
      initialNumToRender: 8,
      maxToRenderPerBatch: 8,
      testID: "native-production-task-queue",
      windowSize: 7,
    });
  });

  it("uses one full priority card followed by compact queue rows", () => {
    const second = { ...task, taskId: "77777777-7777-4777-8777-777777777777" };
    const list = render({ tasks: [task, second] }).find(
      (node) => node.type === "FlatList",
    )!;
    const renderItem = list.props.renderItem as (input: {
      index: number;
      item: typeof task;
    }) => Element;

    expect(renderItem({ index: 0, item: task }).type).toBe(NativeTaskCard);
    expect(renderItem({ index: 1, item: second }).type).toBe(
      NativeTaskQueueRow,
    );
  });

  it("keeps the manual refresh action reachable", () => {
    const refresh = render().find(
      (node) =>
        node.type === NativeManualRefreshButton &&
        node.props.label === "Refresh",
    )!;
    expect(refresh.props.disabled).toBe(false);
  });

  it("keeps automatic refresh visually silent without replacing retained tasks", () => {
    const idle = render({ tasks: [task] }).find(
      (node) => node.type === NativeManualRefreshButton,
    )!;
    const nodes = render({ queueRefreshing: true, tasks: [task] });
    const automatic = nodes.find(
      (node) => node.type === NativeManualRefreshButton,
    )!;

    expect(automatic.props).toMatchObject({
      disabled: false,
      label: idle.props.label,
    });
    expect(automatic.props).not.toHaveProperty("busy");
    expect(automatic.props).not.toHaveProperty("queueRefreshing");
    expect(nodes.some((node) => node.type === "FlatList")).toBe(true);
  });

  it("keeps initial loading distinct from a retained queue refresh", () => {
    const nodes = render({ queueLoading: true, tasks: [] });
    expect(nodes.some((node) => node.type === "FlatList")).toBe(false);
    expect(
      nodes.find((node) => node.type === EmployeeStatus)?.props.children,
    ).toBe("Loading current operational state…");
  });

  it.each([
    ["en", "Refreshing current Tasks…"],
    ["ar", "جارٍ تحديث المهام الحالية…"],
  ] as const)(
    "does not add a layout row during a retained %s refresh",
    (locale, refreshingCopy) => {
      const idle = directElements(panel({ tasks: [task] }, locale));
      const refreshing = directElements(
        panel({ queueRefreshing: true, tasks: [task] }, locale),
      );

      expect(refreshing.map((node) => node.type)).toEqual(
        idle.map((node) => node.type),
      );
      expect(
        refreshing.some(
          (node) =>
            node.type === EmployeeStatus &&
            node.props.children === refreshingCopy,
        ),
      ).toBe(false);
    },
  );

  it("preserves task hierarchy and ordering for unchanged refresh state", () => {
    const second = { ...task, taskId: "77777777-7777-4777-8777-777777777777" };
    const ids = (refreshing: boolean) =>
      render({ queueRefreshing: refreshing, tasks: [task, second] }).find(
        (node) => node.type === "FlatList",
      )!.props.data as readonly (typeof task)[];

    expect(ids(false).map((item) => item.taskId)).toEqual(
      ids(true).map((item) => item.taskId),
    );
  });

  it("still renders a materially changed authoritative queue", () => {
    const second = { ...task, taskId: "77777777-7777-4777-8777-777777777777" };
    const list = render({ tasks: [second, task] }).find(
      (node) => node.type === "FlatList",
    )!;

    expect(
      (list.props.data as readonly (typeof task)[]).map((item) => item.taskId),
    ).toEqual([second.taskId, task.taskId]);
  });

  it("shows a stale warning while retaining a verified queue", () => {
    const nodes = render({
      queueFailure: { code: "NETWORK_ERROR", message: "Offline", status: 0 },
      tasks: [task],
    });
    expect(nodes.some((node) => node.type === EmployeeError)).toBe(true);
    expect(nodes.find((node) => node.type === "FlatList")?.props.data).toEqual([
      task,
    ]);
  });

  it("shows a truthful empty state after a successful empty snapshot", () => {
    const list = render({ successfulQueueSnapshotCount: 1, tasks: [] }).find(
      (node) => node.type === "FlatList",
    )!;
    expect((list.props.ListEmptyComponent as Element).type).toBe(
      EmployeeStatus,
    );
  });

  it("retains a verified queue during same-authority context revalidation", () => {
    const nodes = render({ phase: "loading-context", tasks: [task] });
    expect(nodes.some((node) => node.type === "FlatList")).toBe(true);
  });

  it("routes hard-stop recovery through operational context revalidation", () => {
    const nodes = render({ queueHardStopped: true, tasks: [] });
    const refresh = nodes.find(
      (node) => node.type === EmployeeButton && node.props.label === "Refresh",
    )!;
    (refresh.props.onPress as () => void)();

    expect(operations.refresh).toHaveBeenCalled();
    expect(nodes.some((node) => node.type === "FlatList")).toBe(false);
  });
});
