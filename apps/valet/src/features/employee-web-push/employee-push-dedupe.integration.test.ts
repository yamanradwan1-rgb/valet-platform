import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffTaskQueueItem } from "@valet/contracts";

import {
  createRetrievalAlertTracker,
  observeRetrievalIdentity,
  observeRetrievalSnapshot,
} from "../retrieval-alert/retrieval-alert-tracker";
import {
  clearEmployeePushIdentities,
  handleEmployeePushClientMessage,
  subscribeEmployeePushIdentity,
} from "./employee-push-identity-bridge";

const TASK_A = "11111111-1111-4111-8111-111111111111";
const TASK_B = "22222222-2222-4222-8222-222222222222";

function task(taskId: string): StaffTaskQueueItem {
  return {
    createdAt: "2026-08-29T10:00:00.000Z",
    currentAssigneeMembershipId: null,
    parkingSpot: null,
    parkingZone: null,
    retrievalRequestedAt: "2026-08-29T10:00:00.000Z",
    sessionId: "33333333-3333-4333-8333-333333333333",
    status: "QUEUED",
    taskId,
    taskType: "RETRIEVAL",
    valetSessionState: "REQUESTED",
    valetSessionVersion: 2,
    vehicle: {
      color: null,
      make: null,
      model: null,
      plateNumberRaw: null,
      temporaryDescriptor: "Vehicle",
    },
    version: 1,
  };
}

function observed(taskId: string, type = "VAYLET_EMPLOYEE_PUSH_OBSERVED") {
  return { identity: taskId, route: "TASKS", type };
}

describe("Employee push and polling presentation integration", () => {
  beforeEach(clearEmployeePushIdentities);

  it("dedupes push-first, delayed refresh, and duplicate remote delivery", () => {
    const tracker = createRetrievalAlertTracker();
    observeRetrievalSnapshot(tracker, [], 1);
    const listener = vi.fn((identity: string) =>
      observeRetrievalIdentity(tracker, identity),
    );
    const unsubscribe = subscribeEmployeePushIdentity(listener);
    handleEmployeePushClientMessage(observed(TASK_A));
    handleEmployeePushClientMessage(observed(TASK_A));
    expect(observeRetrievalSnapshot(tracker, [task(TASK_A)], 2)).toEqual([]);
    expect(observeRetrievalSnapshot(tracker, [task(TASK_A)], 2)).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("does not replay after poll-first presentation or notification click", () => {
    const tracker = createRetrievalAlertTracker();
    observeRetrievalSnapshot(tracker, [], 1);
    expect(observeRetrievalSnapshot(tracker, [task(TASK_A)], 2)).toEqual([
      TASK_A,
    ]);
    const unsubscribe = subscribeEmployeePushIdentity((identity) =>
      observeRetrievalIdentity(tracker, identity),
    );
    const refetch = vi.fn();
    handleEmployeePushClientMessage(
      observed(TASK_A, "VAYLET_EMPLOYEE_NOTIFICATION_CLICK"),
      refetch,
    );
    expect(observeRetrievalSnapshot(tracker, [task(TASK_A)], 3)).toEqual([]);
    expect(refetch).toHaveBeenCalledWith(TASK_A);
    unsubscribe();
  });

  it("keeps distinct Task identities independently presentable", () => {
    const tracker = createRetrievalAlertTracker();
    observeRetrievalSnapshot(tracker, [], 1);
    observeRetrievalIdentity(tracker, TASK_A);
    expect(
      observeRetrievalSnapshot(tracker, [task(TASK_A), task(TASK_B)], 2),
    ).toEqual([TASK_B]);
  });
});
