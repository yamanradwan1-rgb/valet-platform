import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { StaffTaskQueueItem } from "@valet/employee-client";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (value: unknown) => value },
  Text: "Text",
  View: "View",
}));

const { NativeTaskCard } = await import("../src/tasks/native-task-card");
const { NativeTaskQueueRow } =
  await import("../src/tasks/native-task-queue-row");
const { EmployeeBadge } = await import("../src/employee-ui/employee-feedback");
const { NativeTaskActionButton, nativeTaskActionButtonStyles } =
  await import("../src/tasks/native-task-action-button");
const { nativeTaskCardStyles } =
  await import("../src/tasks/native-task-card-styles");
const { nativeNewVehicleButtonStyles } =
  await import("../src/tasks/native-new-vehicle-button");
const { EmployeeChevronRightIcon } =
  await import("../src/employee-ui/employee-icons");
const { getNativeTasksCopy } = await import("../src/tasks/native-tasks-copy");
const { operations: snapshotFixture } =
  await import("./production-shell-test-fixture");

type Element = ReactElement<Record<string, unknown>>;
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

const membershipId = snapshotFixture("ready").scope!.membershipId;
const task: StaffTaskQueueItem = {
  createdAt: "2026-09-03T08:05:00.000Z",
  currentAssigneeMembershipId: membershipId,
  parkingSpot: "12",
  parkingZone: "North",
  retrievalRequestedAt: null,
  sessionId: "44444444-4444-4444-8444-444444444444",
  status: "ASSIGNED",
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "PARKING",
  valetSessionState: "AWAITING_PARKING",
  valetSessionVersion: 1,
  vehicle: {
    color: "Black",
    make: "Toyota",
    model: "Camry",
    plateNumberRaw: "12-34567",
    temporaryDescriptor: null,
  },
  version: 2,
};

function snapshot(
  item: StaffTaskQueueItem,
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
) {
  return {
    ...snapshotFixture("ready"),
    scope: { ...snapshotFixture("ready").scope!, role },
    tasks: [item],
  };
}

function card(item = task, busy = false) {
  return elements(
    NativeTaskCard({
      busy,
      copy: getNativeTasksCopy("en"),
      locale: "en",
      onAction: vi.fn(),
      onOverrideHandoff: vi.fn(),
      snapshot: snapshot(item),
      task: item,
      textAlign: "left",
    }),
  );
}

function row(
  item = task,
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
) {
  const onAction = vi.fn();
  const onOverrideHandoff = vi.fn();
  const nodes = elements(
    NativeTaskQueueRow({
      busy: false,
      copy: getNativeTasksCopy("en"),
      locale: "en",
      onAction,
      onOverrideHandoff,
      snapshot: snapshot(item, role),
      task: item,
      textAlign: "left",
    }),
  );
  return { nodes, onAction, onOverrideHandoff };
}

describe("Web-authoritative Native task cards", () => {
  it("uses priority geometry, vehicle hierarchy, plain status, and exact action height", () => {
    const nodes = card();
    const root = nodes.find(
      (node) => node.props.testID === "native-priority-task",
    )!;
    const button = nodes.find((node) => node.type === NativeTaskActionButton)!;
    const text = JSON.stringify(nodes.map((node) => node.props.children));
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ borderRadius: 16 })]),
    );
    expect(text).not.toContain("Priority task");
    expect(text).toContain("Toyota Camry");
    expect(text).toContain("Status");
    expect(text).toContain("Assigned");
    expect(button.props).toMatchObject({ label: "Accept & Park" });
    expect(nativeTaskActionButtonStyles.button).toMatchObject({
      borderRadius: 12,
      height: 40,
      paddingHorizontal: 16,
    });
    expect(nativeTaskCardStyles.card).toMatchObject({
      elevation: 1,
      shadowOffset: { height: 1, width: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
    });
    expect(nativeNewVehicleButtonStyles.button).toMatchObject({
      elevation: 1,
      shadowOffset: { height: 1, width: 0 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
    });
  });

  it("uses task badge dots and Web task-type variants", () => {
    const parking = card().find((node) => node.type === EmployeeBadge)!;
    const retrieval = card({ ...task, taskType: "RETRIEVAL" }).find(
      (node) => node.type === EmployeeBadge,
    )!;
    expect(parking.props).toMatchObject({ showDot: true, variant: "warning" });
    expect(retrieval.props).toMatchObject({
      showDot: true,
      variant: "primary",
    });
  });

  it("keeps the plate in an LTR identifier island", () => {
    const plate = card().find((node) => node.props.children === "12-34567")!;
    expect(plate.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ writingDirection: "ltr" }),
      ]),
    );
  });

  it("shows assigned-to-other priority work at 0.75 and disables its normal action", () => {
    const other = {
      ...task,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
    };
    const nodes = card(other);
    const root = nodes.find(
      (node) => node.props.testID === "native-priority-task",
    )!;
    const button = nodes.find((node) => node.type === NativeTaskActionButton)!;
    expect(root.props.accessibilityState).toMatchObject({ disabled: true });
    expect(JSON.stringify(root.props.style)).toContain('"opacity":0.75');
    expect(button.props).toMatchObject({ disabled: true, label: "Assigned" });
  });

  it("uses natural row geometry, the exact 16px icon, and 0.60 assigned-other opacity", () => {
    const active = row();
    const root = active.nodes.find(
      (node) => node.props.testID === `native-queue-row-${task.taskId}`,
    )!;
    const chevron = active.nodes.find(
      (node) => node.type === EmployeeChevronRightIcon,
    )!;
    expect(JSON.stringify(root.props.style)).not.toContain("minHeight");
    expect(chevron.props.size).toBe(16);
    (root.props.onPress as () => void)();
    expect(active.onAction).toHaveBeenCalledOnce();

    const other = row({
      ...task,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
    });
    const otherRoot = other.nodes.find(
      (node) => node.props.testID === `native-queue-row-${task.taskId}`,
    )!;
    expect(JSON.stringify(otherRoot.props.style)).toContain('"opacity":0.6');
    expect(otherRoot.props.accessibilityRole).toBeUndefined();
  });

  it("preserves the narrow supervisor handoff override without normal action", () => {
    const overrideTask = {
      ...task,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
      status: "IN_PROGRESS" as const,
      taskType: "RETRIEVAL" as const,
      valetSessionState: "HANDOFF_PENDING" as const,
    };
    const rendered = row(overrideTask, "VALET_SUPERVISOR");
    const root = rendered.nodes.find(
      (node) => node.props.testID === `native-queue-row-${task.taskId}`,
    )!;
    (root.props.onPress as () => void)();
    expect(rendered.onOverrideHandoff).toHaveBeenCalledOnce();
    expect(rendered.onAction).not.toHaveBeenCalled();
  });
});
