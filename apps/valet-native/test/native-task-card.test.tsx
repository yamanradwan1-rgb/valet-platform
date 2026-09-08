import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

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
const { EmployeeButton } = await import("../src/employee-ui/employee-controls");
const { getNativeTasksCopy } = await import("../src/tasks/native-tasks-copy");

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...elements(node.props.children)];
}

const membershipId = "22222222-2222-4222-8222-222222222222";
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
  mutation: EmployeeOperationalSnapshot["mutation"] = { phase: "idle" },
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
): EmployeeOperationalSnapshot {
  return {
    contextFailure: null,
    identityGeneration: 1,
    mutation,
    phase: "ready",
    queueFailure: null,
    queueHardStopped: false,
    queueLoading: false,
    queueRefreshing: false,
    scope: {
      locationCode: "AMM",
      locationId: "11111111-1111-4111-8111-111111111111",
      locationName: "Amman Hotel",
      membershipId,
      organizationId: "33333333-3333-4333-8333-333333333333",
      organizationName: "Operator",
      role,
      shiftId: "55555555-5555-4555-8555-555555555555",
      shiftStartedAt: "2026-09-03T08:00:00.000Z",
    },
    successfulQueueSnapshotCount: 1,
    tasks: [item],
  };
}

const acceptTask = vi.fn();
const operations = { acceptTask } as never;

function render(
  item = task,
  mutation?: EmployeeOperationalSnapshot["mutation"],
) {
  return elements(
    NativeTaskCard({
      copy: getNativeTasksCopy("en"),
      locale: "en",
      operations,
      priority: true,
      snapshot: snapshot(item, mutation),
      task: item,
      textAlign: "left",
    }),
  );
}

function renderRow(
  item = task,
  onOpenParking = vi.fn(),
  onOpenRetrieval = vi.fn(),
  role: "VALET_EMPLOYEE" | "VALET_SUPERVISOR" = "VALET_EMPLOYEE",
) {
  return elements(
    NativeTaskQueueRow({
      copy: getNativeTasksCopy("en"),
      locale: "en",
      operations,
      onOpenParking,
      onOpenRetrieval,
      snapshot: snapshot(item, { phase: "idle" }, role),
      task: item,
      textAlign: "left",
    }),
  );
}

describe("Native production task cards", () => {
  it("presents the priority hierarchy with type, vehicle, status, and age", () => {
    const nodes = render();
    expect(
      nodes.some((node) => node.props.testID === "native-priority-task"),
    ).toBe(true);
    const text = JSON.stringify(nodes.map((node) => node.props.children));
    expect(text).toContain("Priority task");
    expect(text).toContain("Toyota Camry");
    expect(text).toContain("Queued");
    expect(text).toContain("North · 12");
  });

  it("keeps vehicle identifiers in an LTR text island", () => {
    const plate = render().find((node) => node.props.children === "12-34567")!;
    expect(JSON.stringify(plate.props.style)).toContain(
      '"writingDirection":"ltr"',
    );
  });

  it("offers the accepted self-claim action for queued Retrieval work", () => {
    const queued = {
      ...task,
      currentAssigneeMembershipId: null,
      status: "QUEUED" as const,
      taskType: "RETRIEVAL" as const,
    };
    const button = render(queued).find((node) => node.type === EmployeeButton)!;
    expect(button.props.label).toBe("Claim retrieval");
  });

  it("does not expose an action for another employee's assignment", () => {
    const other = {
      ...task,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
    };
    expect(render(other).some((node) => node.type === EmployeeButton)).toBe(
      false,
    );
  });

  it("shows non-color-only busy state and blocks another task during recovery", () => {
    const nodes = render(task, { phase: "submitting", taskId: task.taskId });
    const button = nodes.find((node) => node.type === EmployeeButton)!;
    expect(button.props).toMatchObject({
      busy: true,
      disabled: true,
      label: "Accepting…",
    });
  });

  it("renders ordinary work as a compact actionable row", () => {
    acceptTask.mockClear();
    const nodes = renderRow();
    const row = nodes.find(
      (node) => node.props.testID === `native-queue-row-${task.taskId}`,
    )!;

    expect(row.props.accessibilityRole).toBe("button");
    expect(JSON.stringify(nodes.map((node) => node.props.children))).toContain(
      "Queued",
    );
    (row.props.onPress as () => void)();
    expect(acceptTask).toHaveBeenCalledWith(task.taskId);
  });

  it("stages assigned-to-other rows without a downstream affordance", () => {
    const other = {
      ...task,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
    };
    const nodes = renderRow(other);
    const row = nodes.find(
      (node) => node.props.testID === `native-queue-row-${task.taskId}`,
    )!;
    const text = JSON.stringify(nodes.map((node) => node.props.children));

    expect(row.props.accessibilityRole).toBeUndefined();
    expect(text).toContain("Other staff");
    expect(text).not.toContain("›");
  });

  it.each(["ACCEPTED", "IN_PROGRESS"] as const)(
    "opens the bounded Parking workflow for self-owned %s work",
    (status) => {
      const staged = { ...task, status };
      const onOpenParking = vi.fn();
      const nodes = renderRow(staged, onOpenParking);
      const row = nodes.find(
        (node) => node.props.testID === `native-queue-row-${task.taskId}`,
      )!;

      expect(row.props.accessibilityRole).toBe("button");
      (row.props.onPress as () => void)();
      expect(onOpenParking).toHaveBeenCalledWith(task.taskId, task.sessionId);
      expect(
        JSON.stringify(nodes.map((node) => node.props.children)),
      ).toContain("›");
    },
  );

  it.each(["ACCEPTED", "IN_PROGRESS"] as const)(
    "opens the bounded Retrieval workflow for self-owned %s work",
    (status) => {
      const staged = { ...task, status, taskType: "RETRIEVAL" as const };
      const onOpenRetrieval = vi.fn();
      const nodes = renderRow(staged, vi.fn(), onOpenRetrieval);
      const row = nodes.find(
        (node) => node.props.testID === `native-queue-row-${task.taskId}`,
      )!;

      expect(row.props.accessibilityRole).toBe("button");
      (row.props.onPress as () => void)();
      expect(onOpenRetrieval).toHaveBeenCalledWith(task.taskId, task.sessionId);
    },
  );

  it("opens explicit supervisor override work without claiming another owner's Task", () => {
    acceptTask.mockClear();
    const staged = {
      ...task,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
      status: "IN_PROGRESS" as const,
      taskType: "RETRIEVAL" as const,
      valetSessionState: "HANDOFF_PENDING" as const,
    };
    const onOpenRetrieval = vi.fn();
    const nodes = renderRow(
      staged,
      vi.fn(),
      onOpenRetrieval,
      "VALET_SUPERVISOR",
    );
    const row = nodes.find(
      (node) => node.props.testID === `native-queue-row-${task.taskId}`,
    )!;
    expect(row.props.accessibilityLabel).toContain("Override Handoff");
    (row.props.onPress as () => void)();
    expect(onOpenRetrieval).toHaveBeenCalledWith(task.taskId, task.sessionId);
    expect(acceptTask).not.toHaveBeenCalled();
  });
});
