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
  const snapshot = { ...snapshotFixture("ready"), ...overrides };
  return elements(
    NativeTasksPanel({
      locale: "en",
      operations,
      snapshot,
      textAlign: "left",
    }),
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

  it("keeps the manual refresh action reachable", () => {
    const refresh = render().find(
      (node) => node.type === EmployeeButton && node.props.label === "Refresh",
    )!;
    expect(refresh.props.disabled).toBe(false);
  });

  it("marks refresh busy without replacing retained tasks", () => {
    const nodes = render({ queueRefreshing: true, tasks: [task] });
    const refresh = nodes.find(
      (node) => node.type === EmployeeButton && node.props.label === "Refresh",
    )!;
    expect(refresh.props).toMatchObject({ busy: true, disabled: true });
    expect(nodes.some((node) => node.type === "FlatList")).toBe(true);
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
