import type { ReactElement } from "react";
import { vi } from "vitest";

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

export const { NativeTasksPanel } =
  await import("../src/tasks/native-tasks-panel");
export const { NativeTaskCard } = await import("../src/tasks/native-task-card");
export const { NativeTaskQueueRow } =
  await import("../src/tasks/native-task-queue-row");
export const { NativeTaskShiftStrip } =
  await import("../src/tasks/native-task-shift-strip");
export const { NativeManualRefreshButton } =
  await import("../src/tasks/native-manual-refresh-button");
export const { EmployeeButton } =
  await import("../src/employee-ui/employee-controls");
export const { EmployeeStatus } =
  await import("../src/employee-ui/employee-feedback");
export const { getNativeTasksCopy } =
  await import("../src/tasks/native-tasks-copy");
export const { operations: tasksOperationsFixture } =
  await import("./production-shell-test-fixture");

export type TasksElement = ReactElement<Record<string, unknown>>;

export function taskElements(value: unknown): TasksElement[] {
  if (Array.isArray(value)) return value.flatMap(taskElements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as TasksElement;
  return [node, ...taskElements(node.props.children)];
}

export const taskPanelRow = {
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

export function renderTasksPanel(tasks = [taskPanelRow]) {
  return taskElements(
    NativeTasksPanel({
      locale: "en",
      operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
      snapshot: {
        ...tasksOperationsFixture("ready"),
        successfulQueueSnapshotCount: 1,
        tasks,
      },
      textAlign: "left",
    }),
  );
}
