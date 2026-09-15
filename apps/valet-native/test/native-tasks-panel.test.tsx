import { describe, expect, it, vi } from "vitest";

import {
  EmployeeButton,
  EmployeeStatus,
  getNativeTasksCopy,
  NativeManualRefreshButton,
  NativeTaskCard,
  NativeTaskQueueRow,
  NativeTasksPanel,
  NativeTaskShiftStrip,
  renderTasksPanel,
  taskElements,
  taskPanelRow,
  tasksOperationsFixture,
  type TasksElement,
} from "./native-tasks-panel-test-fixture";

describe("Web-authoritative Native Tasks screen", () => {
  it("owns a full-width shift strip outside the padded main content", () => {
    const nodes = renderTasksPanel();
    const strip = nodes.find((node) => node.type === NativeTaskShiftStrip)!;
    expect(strip.props).toMatchObject({
      activeLabel: "Shift active",
      nowLabel: "now",
    });
    const root = nodes[0]!;
    expect((root.props.children as TasksElement[])[0]?.type).toBe(
      NativeTaskShiftStrip,
    );
  });

  it("uses a 24px task title and has no visible manual Refresh control", () => {
    const nodes = renderTasksPanel();
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
    const unavailable = taskElements(
      NativeTasksPanel({
        locale: "en",
        operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
        snapshot: {
          ...tasksOperationsFixture("ready"),
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
    const second = {
      ...taskPanelRow,
      taskId: "77777777-7777-4777-8777-777777777777",
    };
    const nodes = renderTasksPanel([taskPanelRow, second]);
    expect(nodes.some((node) => node.type === NativeTaskCard)).toBe(true);
    const list = nodes.find((node) => node.type === "FlatList")!;
    expect(list.props.data).toEqual([second]);
    const row = (
      list.props.renderItem as (input: {
        item: typeof taskPanelRow;
      }) => TasksElement
    )({ item: second });
    expect(row.type).toBe(NativeTaskQueueRow);
  });

  it("uses dedicated localized copy only for the ready empty queue", () => {
    const copy = getNativeTasksCopy("en");
    const ready = renderTasksPanel([]);
    const list = ready.find((node) => node.type === "FlatList")!;
    const empty = list.props.ListEmptyComponent as TasksElement;
    expect(empty.type).toBe(EmployeeStatus);
    expect(empty.props.children).toBe("No tasks in the queue");
    expect(empty.props.children).toBe(copy.empty);
    expect(empty.props.children).not.toBe(copy.queue);

    for (const snapshot of [
      { ...tasksOperationsFixture("loading-context"), queueLoading: true },
      tasksOperationsFixture("error"),
      tasksOperationsFixture("no-active-shift"),
    ]) {
      const nodes = taskElements(
        NativeTasksPanel({
          locale: "en",
          operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
          snapshot,
          textAlign: "left",
        }),
      );
      expect(nodes.some((node) => node.type === "FlatList")).toBe(false);
      expect(nodes.some((node) => node.props.children === copy.empty)).toBe(
        false,
      );
    }

    expect(getNativeTasksCopy("ar").empty).toBe(
      "لا توجد مهام في قائمة الانتظار",
    );
  });

  it("retains a verified queue during same-authority refresh", () => {
    const nodes = taskElements(
      NativeTasksPanel({
        locale: "en",
        operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
        snapshot: {
          ...tasksOperationsFixture("ready"),
          queueRefreshing: true,
          tasks: [taskPanelRow],
        },
        textAlign: "left",
      }),
    );
    expect(nodes.some((node) => node.type === NativeTaskCard)).toBe(true);
  });

  it("does not render Native-only mutation or queue recovery banners", () => {
    const messages = [
      "Accepted from current server state.",
      "Checking current server state…",
      "Processing...",
      "Accept result is unknown. Refresh server state before retrying.",
      "Showing the last verified queue while refresh is unavailable.",
    ];
    for (const phase of [
      "accepted",
      "reconciling",
      "submitting",
      "recovery-unavailable",
    ] as const) {
      const nodes = taskElements(
        NativeTasksPanel({
          locale: "en",
          operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
          snapshot: {
            ...tasksOperationsFixture("ready"),
            mutation: { phase, taskId: taskPanelRow.taskId },
            queueFailure: {
              code: "NETWORK_ERROR",
              message: "Offline",
              status: 0,
            },
            tasks: [taskPanelRow],
          },
          textAlign: "left",
        }),
      );
      const visible = JSON.stringify(
        nodes
          .filter((node) => node.type === "Text")
          .map((node) => node.props.children),
      );
      for (const message of messages) expect(visible).not.toContain(message);
    }
  });
});
