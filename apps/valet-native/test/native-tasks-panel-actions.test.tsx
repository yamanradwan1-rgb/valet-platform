import { describe, expect, it, vi } from "vitest";

import {
  NativeTaskCard,
  NativeTasksPanel,
  taskElements,
  taskPanelRow,
  tasksOperationsFixture,
  type TasksElement,
} from "./native-tasks-panel-test-fixture";

describe("Native Tasks action fences", () => {
  it("prevents duplicate task actions while the first action is in flight", async () => {
    let finish!: (value: boolean) => void;
    const action = vi.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    const nodes = taskElements(
      NativeTasksPanel({
        locale: "en",
        onTaskAction: action,
        operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
        snapshot: { ...tasksOperationsFixture("ready"), tasks: [taskPanelRow] },
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

  it("globally fences normal actions and supervisor override entry", async () => {
    let finish!: (value: boolean) => void;
    const action = vi.fn(
      () => new Promise<boolean>((resolve) => (finish = resolve)),
    );
    const override = vi.fn();
    const overrideTask = {
      ...taskPanelRow,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
      status: "IN_PROGRESS" as const,
      taskId: "88888888-8888-4888-8888-888888888888",
      valetSessionState: "HANDOFF_PENDING" as const,
    };
    const ready = tasksOperationsFixture("ready");
    const snapshot = {
      ...ready,
      scope: { ...ready.scope!, role: "VALET_SUPERVISOR" as const },
      tasks: [taskPanelRow, overrideTask],
    };
    const nodes = taskElements(
      NativeTasksPanel({
        locale: "en",
        onOverrideHandoff: override,
        onTaskAction: action,
        operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
        snapshot,
        textAlign: "left",
      }),
    );
    const card = nodes.find((node) => node.type === NativeTaskCard)!;
    const list = nodes.find((node) => node.type === "FlatList")!;
    const overrideRow = (
      list.props.renderItem as (input: {
        item: typeof overrideTask;
      }) => TasksElement
    )({ item: overrideTask });
    (card.props.onAction as () => void)();
    (overrideRow.props.onOverrideHandoff as () => void)();
    expect(override).not.toHaveBeenCalled();
    finish(true);
    await Promise.resolve();

    const normalDuringOverride: { current?: () => void } = {};
    const nestedAction = vi.fn();
    const nestedOverride = vi.fn(() => normalDuringOverride.current?.());
    const nestedNodes = taskElements(
      NativeTasksPanel({
        locale: "en",
        onOverrideHandoff: nestedOverride,
        onTaskAction: nestedAction,
        operations: { acceptTask: vi.fn(), refresh: vi.fn() } as never,
        snapshot,
        textAlign: "left",
      }),
    );
    normalDuringOverride.current = nestedNodes.find(
      (node) => node.type === NativeTaskCard,
    )!.props.onAction as () => void;
    const nestedList = nestedNodes.find((node) => node.type === "FlatList")!;
    const nestedOverrideRow = (
      nestedList.props.renderItem as (input: {
        item: typeof overrideTask;
      }) => TasksElement
    )({ item: overrideTask });
    (nestedOverrideRow.props.onOverrideHandoff as () => void)();
    expect(nestedOverride).toHaveBeenCalledOnce();
    expect(nestedAction).not.toHaveBeenCalled();
  });
});
