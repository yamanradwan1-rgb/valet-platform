import { describe, expect, it } from "vitest";
import type {
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import {
  canAcceptNativeTask,
  nativeMutationMessage,
  nativeTaskVehicleLabel,
} from "../src/tasks/native-task-presentation";
import { getNativeTasksCopy } from "../src/tasks/native-tasks-copy";

const membershipId = "22222222-2222-4222-8222-222222222222";
const task: StaffTaskQueueItem = {
  createdAt: "2026-09-03T08:05:00.000Z",
  currentAssigneeMembershipId: membershipId,
  parkingSpot: null,
  parkingZone: null,
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
  mutation: EmployeeOperationalSnapshot["mutation"] = { phase: "idle" },
): EmployeeOperationalSnapshot {
  return {
    contextFailure: null,
    identityGeneration: 1,
    mutation,
    phase: "ready",
    queueFailure: null,
    queueLoading: false,
    scope: {
      locationCode: "AMM-1",
      locationId: "11111111-1111-4111-8111-111111111111",
      locationName: "Amman Hotel",
      membershipId,
      organizationId: "33333333-3333-4333-8333-333333333333",
      organizationName: "Operator",
      role: "VALET_EMPLOYEE",
      shiftId: "55555555-5555-4555-8555-555555555555",
      shiftStartedAt: "2026-09-03T08:00:00.000Z",
    },
    tasks: [task],
  };
}

describe("Native Tasks presentation", () => {
  it("shows Accept only for the current ASSIGNED Parking Task owner", () => {
    expect(canAcceptNativeTask(snapshot(), task)).toBe(true);
    expect(
      canAcceptNativeTask(snapshot(), {
        ...task,
        currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
      }),
    ).toBe(false);
    expect(
      canAcceptNativeTask(snapshot(), { ...task, status: "ACCEPTED" }),
    ).toBe(false);
  });

  it.each(["submitting", "reconciling", "recovery-unavailable"] as const)(
    "blocks every Accept action while the original Task is %s",
    (phase) => {
      expect(
        canAcceptNativeTask(snapshot({ phase, taskId: task.taskId }), task),
      ).toBe(false);
      expect(
        canAcceptNativeTask(snapshot({ phase, taskId: task.taskId }), {
          ...task,
          taskId: "88888888-8888-4888-8888-888888888888",
        }),
      ).toBe(false);
    },
  );

  it("uses real vehicle facts and localized EN/AR operational copy", () => {
    expect(nativeTaskVehicleLabel(task)).toBe("Toyota Camry");
    expect(getNativeTasksCopy("en").tasks).toBe("Parking Tasks");
    expect(getNativeTasksCopy("ar").tasks).toBe("مهام صف المركبات");
    expect(getNativeTasksCopy("ar").reconcile).toContain("الخادم");
  });

  it("presents truthful no-Shift, error, accepted, and recovery states", () => {
    const copy = getNativeTasksCopy("en");
    expect(copy.noShift).toBe("No active eligible Shift.");
    expect(copy.error).toBe("Operational state is temporarily unavailable.");
    expect(nativeMutationMessage(copy, "accepted")).toContain("server state");
    expect(nativeMutationMessage(copy, "reconciling")).toContain("server");
    expect(nativeMutationMessage(copy, "conflict")).toContain("changed");
    expect(nativeMutationMessage(copy, "recovery-unavailable")).toBe(
      copy.unknownResult,
    );
  });
});
