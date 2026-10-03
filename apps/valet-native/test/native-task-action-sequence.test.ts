import { describe, expect, it, vi } from "vitest";
import type {
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import { executeNativeTaskAction } from "../src/tasks/native-task-action-sequence";
import { operations as fixture } from "./production-shell-test-fixture";

const task: StaffTaskQueueItem = {
  createdAt: "2026-09-03T08:05:00.000Z",
  currentAssigneeMembershipId: fixture("ready").scope!.membershipId,
  parkingSpot: null,
  parkingZone: null,
  retrievalRequestedAt: null,
  sessionId: "44444444-4444-4444-8444-444444444444",
  status: "ACCEPTED",
  taskId: "66666666-6666-4666-8666-666666666666",
  taskType: "PARKING",
  valetSessionState: "AWAITING_PARKING",
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

function setup(
  initial: StaffTaskQueueItem,
  final: StaffTaskQueueItem = { ...initial, status: "ACCEPTED" },
) {
  let current: EmployeeOperationalSnapshot = {
    ...fixture("ready"),
    identityGeneration: 7,
    tasks: [initial],
  };
  const acceptTask = vi.fn(async () => {
    current = { ...current, tasks: [final] };
  });
  let parkingPhase =
    initial.status === "IN_PROGRESS"
      ? "started"
      : initial.status === "ACCEPTED"
        ? "accepted"
        : "assigned";
  const startParking = vi.fn(async () => {
    parkingPhase = "started";
  });
  const openParking = vi.fn(async () => undefined);
  const checkParking = vi.fn(async () => {
    parkingPhase = "accepted";
  });
  let retrievalPhase = "key-checkout";
  return {
    acceptTask,
    input: {
      identityGeneration: 7,
      operations: { acceptTask, current: () => current } as never,
      parking: {
        checkServerState: checkParking,
        current: () => ({
          phase: parkingPhase,
          identityGeneration: 7,
          scope: current.scope,
          session: { sessionId: initial.sessionId },
          task: initial,
        }),
        openQueueTask: openParking,
        startParking,
      } as never,
      retrieval: {
        current: () => ({ phase: retrievalPhase }),
        openQueueTask: vi.fn(async () => undefined),
      } as never,
      scope: current.scope!,
      task: initial,
    },
    setRetrievalPhase: (phase: string) => {
      retrievalPhase = phase;
    },
    failParking: () => {
      parkingPhase = "unavailable";
    },
    checkParking,
    openParking,
    startParking,
  };
}

describe("Native pre-custody task entry", () => {
  it.each(["QUEUED", "ASSIGNED"] as const)(
    "accepts %s Parking work and opens explicit pre-start Parking",
    async (status) => {
      const initial = {
        ...task,
        currentAssigneeMembershipId:
          status === "QUEUED" ? null : task.currentAssigneeMembershipId,
        status,
      };
      const context = setup(initial);
      await expect(executeNativeTaskAction(context.input)).resolves.toEqual({
        destination: "parking",
        kind: "navigate",
      });
      expect(context.acceptTask).toHaveBeenCalledWith(task.taskId);
      expect(context.openParking.mock.invocationCallOrder[0]).toBeLessThan(
        context.acceptTask.mock.invocationCallOrder[0]!,
      );
      expect(context.checkParking).toHaveBeenCalledOnce();
      expect(context.startParking).not.toHaveBeenCalled();
    },
  );

  it.each(["ACCEPTED", "IN_PROGRESS"] as const)(
    "opens %s Parking work without another queue transition",
    async (status) => {
      const context = setup({ ...task, status });
      await expect(executeNativeTaskAction(context.input)).resolves.toEqual({
        destination: "parking",
        kind: "navigate",
      });
      expect(context.acceptTask).not.toHaveBeenCalled();
      expect(context.startParking).not.toHaveBeenCalled();
    },
  );

  it.each(["QUEUED", "ASSIGNED", "ACCEPTED", "IN_PROGRESS"] as const)(
    "reaches Retrieval from %s in one action",
    async (status) => {
      const initial = {
        ...task,
        currentAssigneeMembershipId:
          status === "QUEUED" ? null : task.currentAssigneeMembershipId,
        status,
        taskType: "RETRIEVAL" as const,
        valetSessionState:
          status === "IN_PROGRESS"
            ? ("RETRIEVING" as const)
            : ("REQUESTED" as const),
      };
      const context = setup(initial, {
        ...initial,
        currentAssigneeMembershipId: task.currentAssigneeMembershipId,
        status: status === "IN_PROGRESS" ? "IN_PROGRESS" : "ACCEPTED",
      });
      context.setRetrievalPhase(
        status === "IN_PROGRESS" ? "retrieving" : "key-checkout",
      );
      await expect(executeNativeTaskAction(context.input)).resolves.toEqual({
        destination: "retrieval",
        kind: "navigate",
      });
      expect(context.acceptTask).toHaveBeenCalledTimes(
        status === "QUEUED" || status === "ASSIGNED" ? 1 : 0,
      );
    },
  );

  it("blocks assigned-to-other work and never mutates it", async () => {
    const context = setup({
      ...task,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
    });
    await expect(executeNativeTaskAction(context.input)).resolves.toEqual({
      kind: "denied",
    });
    expect(context.acceptTask).not.toHaveBeenCalled();
    expect(context.startParking).not.toHaveBeenCalled();
  });

  it("does not navigate when authoritative Parking detail is unavailable", async () => {
    const context = setup(task);
    context.failParking();
    await expect(executeNativeTaskAction(context.input)).resolves.toEqual({
      kind: "failed",
    });
  });

  it("rejects a stale clicked version before issuing a command", async () => {
    const authoritative = { ...task, status: "QUEUED" as const, version: 4 };
    const context = setup(authoritative);
    await expect(
      executeNativeTaskAction({
        ...context.input,
        task: { ...authoritative, version: 3 },
      }),
    ).resolves.toEqual({ kind: "denied" });
    expect(context.acceptTask).not.toHaveBeenCalled();
    expect(context.startParking).not.toHaveBeenCalled();
  });
});
