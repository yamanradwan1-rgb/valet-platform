import { describe, expect, it } from "vitest";
import type {
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import {
  canAcceptNativeTask,
  canOpenNativeHandoffOverride,
  nativeMutationMessage,
  nativeQueueFailureMessage,
  nativeTaskActionLabel,
  nativeTaskAge,
  nativeTaskParkingContext,
  nativeTaskStatusLabel,
  nativeTaskTime,
  nativeTaskTypeLabel,
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
    successfulQueueSnapshotCount: 1,
    scope: {
      locationCode: "AMM-1",
      locationId: "11111111-1111-4111-8111-111111111111",
      locationName: "Amman Hotel",
      membershipId,
      organizationId: "33333333-3333-4333-8333-333333333333",
      organizationName: "Operator",
      role,
      shiftId: "55555555-5555-4555-8555-555555555555",
      shiftStartedAt: "2026-09-03T08:00:00.000Z",
    },
    tasks: [task],
  };
}

describe("Native Tasks presentation", () => {
  it("exposes non-owner HANDOFF_PENDING override only to a supervisor", () => {
    const pending = {
      ...task,
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
      status: "IN_PROGRESS" as const,
      taskType: "RETRIEVAL" as const,
      valetSessionState: "HANDOFF_PENDING" as const,
    };
    expect(
      canOpenNativeHandoffOverride(
        snapshot({ phase: "idle" }, "VALET_SUPERVISOR"),
        pending,
      ),
    ).toBe(true);
    expect(canOpenNativeHandoffOverride(snapshot(), pending)).toBe(false);
    expect(
      canOpenNativeHandoffOverride(
        snapshot({ phase: "idle" }, "VALET_SUPERVISOR"),
        { ...pending, valetSessionState: "READY" },
      ),
    ).toBe(false);
  });
  it("shows Accept only for the current ASSIGNED Task owner", () => {
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
    expect(
      canAcceptNativeTask(snapshot(), {
        ...task,
        currentAssigneeMembershipId: null,
        status: "QUEUED",
        taskType: "RETRIEVAL",
      }),
    ).toBe(true);
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
    expect(getNativeTasksCopy("en").tasks).toBe("Tasks");
    expect(getNativeTasksCopy("ar").tasks).toBe("المهام");
    expect(getNativeTasksCopy("ar").reconcile).toContain("الخادم");
    expect(getNativeTasksCopy("en")).toMatchObject({
      retrievalAlertBody: "A guest has requested their vehicle.",
      retrievalAlertTitle: "Vehicle requested",
    });
    expect(getNativeTasksCopy("ar")).toMatchObject({
      retrievalAlertBody: "طلب أحد الضيوف استرجاع مركبته.",
      retrievalAlertTitle: "تم طلب المركبة",
    });
  });

  it("localizes task type, status, and queue-owned actions", () => {
    const en = getNativeTasksCopy("en");
    const ar = getNativeTasksCopy("ar");
    expect(nativeTaskTypeLabel(en, "PARKING")).toBe("Parking");
    expect(nativeTaskTypeLabel(ar, "RETRIEVAL")).toBe("استرجاع المركبة");
    expect(nativeTaskStatusLabel(en, "IN_PROGRESS")).toBe("In progress");
    expect(nativeTaskStatusLabel(ar, "QUEUED")).toBe("في قائمة الانتظار");
    expect(
      nativeTaskActionLabel(en, {
        ...task,
        currentAssigneeMembershipId: null,
        status: "QUEUED",
      }),
    ).toBe("Claim task");
  });

  it("formats age and parking context from canonical task facts", () => {
    expect(nativeTaskAge(task, Date.parse("2026-09-03T08:06:05.000Z"))).toBe(
      "01:05",
    );
    expect(
      nativeTaskParkingContext({
        ...task,
        parkingSpot: "P-12",
        parkingZone: "North",
      }),
    ).toBe("North · P-12");
    expect(
      nativeTaskTime(
        getNativeTasksCopy("en"),
        "en",
        task,
        Date.parse("2026-09-03T08:06:05.000Z"),
      ),
    ).toBe("Queued 1 min. ago");
    expect(
      nativeTaskTime(
        getNativeTasksCopy("ar"),
        "ar",
        { ...task, retrievalRequestedAt: task.createdAt },
        Date.parse("2026-09-03T08:06:05.000Z"),
      ),
    ).toContain("مطلوبة");
  });

  it("formats EN and AR task times when RelativeTimeFormat is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Intl,
      "RelativeTimeFormat",
    );
    Object.defineProperty(Intl, "RelativeTimeFormat", {
      configurable: true,
      value: undefined,
    });

    try {
      const now = Date.parse("2026-09-03T08:10:00.000Z");
      expect(() =>
        nativeTaskTime(getNativeTasksCopy("en"), "en", task, now),
      ).not.toThrow();
      expect(nativeTaskTime(getNativeTasksCopy("en"), "en", task, now)).toBe(
        "Queued 5 min. ago",
      );
      expect(
        nativeTaskTime(
          getNativeTasksCopy("en"),
          "en",
          { ...task, createdAt: "2026-09-03T08:10:00.000Z" },
          now,
        ),
      ).toBe("Queued this minute");
      expect(
        nativeTaskTime(
          getNativeTasksCopy("ar"),
          "ar",
          { ...task, retrievalRequestedAt: task.createdAt },
          now,
        ),
      ).toBe("مطلوبة قبل 5 دقائق");
      expect(
        nativeTaskTime(
          getNativeTasksCopy("ar"),
          "ar",
          {
            ...task,
            retrievalRequestedAt: "2026-09-03T08:10:00.000Z",
          },
          now,
        ),
      ).toBe("مطلوبة هذه الدقيقة");
    } finally {
      if (descriptor !== undefined) {
        Object.defineProperty(Intl, "RelativeTimeFormat", descriptor);
      }
    }
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

  it("distinguishes retained stale, rate-limit, and scope-loss queue failures", () => {
    const copy = getNativeTasksCopy("en");
    const network = { code: "NETWORK_ERROR", message: "Offline", status: 0 };
    const limited = { code: "RATE_LIMITED", message: "Wait", status: 429 };
    expect(nativeQueueFailureMessage(copy, network, false, true)).toBe(
      copy.stale,
    );
    expect(nativeQueueFailureMessage(copy, limited, false, true)).toBe(
      copy.rateLimited,
    );
    expect(nativeQueueFailureMessage(copy, network, true, false)).toBe(
      copy.accessChanged,
    );
  });
});
