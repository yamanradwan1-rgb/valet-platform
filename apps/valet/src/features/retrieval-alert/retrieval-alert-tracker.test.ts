import { describe, expect, it } from "vitest";
import type { StaffTaskQueueItem } from "@valet/contracts";

import {
  createRetrievalAlertTracker,
  observeRetrievalSnapshot,
} from "./retrieval-alert-tracker";

const TASK_ID_A = "11111111-1111-4111-8111-111111111111";
const TASK_ID_B = "22222222-2222-4222-8222-222222222222";

function task(
  taskId: string,
  overrides: Partial<StaffTaskQueueItem> = {},
): StaffTaskQueueItem {
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
    ...overrides,
  };
}

describe("Retrieval foreground alert tracking", () => {
  it("baselines every Task ID from the first successful queue snapshot", () => {
    const tracker = createRetrievalAlertTracker();
    expect(observeRetrievalSnapshot(tracker, [task(TASK_ID_A)], 1)).toEqual([]);
    expect(observeRetrievalSnapshot(tracker, [task(TASK_ID_A)], 2)).toEqual([]);
  });

  it("alerts a later new actionable Retrieval Task exactly once", () => {
    const tracker = createRetrievalAlertTracker();
    observeRetrievalSnapshot(tracker, [], 1);
    expect(observeRetrievalSnapshot(tracker, [task(TASK_ID_A)], 2)).toEqual([
      TASK_ID_A,
    ]);
    expect(observeRetrievalSnapshot(tracker, [task(TASK_ID_A)], 3)).toEqual([]);
    expect(observeRetrievalSnapshot(tracker, [], 4)).toEqual([]);
    expect(observeRetrievalSnapshot(tracker, [task(TASK_ID_A)], 5)).toEqual([]);
  });

  it.each([
    { taskType: "PARKING" as const },
    { status: "ASSIGNED" as const },
    { status: "ACCEPTED" as const },
    { status: "IN_PROGRESS" as const },
    {
      currentAssigneeMembershipId:
        "44444444-4444-4444-8444-444444444444",
    },
  ])("does not alert an ineligible new Task: %o", (overrides) => {
    const tracker = createRetrievalAlertTracker();
    observeRetrievalSnapshot(tracker, [], 1);
    expect(
      observeRetrievalSnapshot(tracker, [task(TASK_ID_A, overrides)], 2),
    ).toEqual([]);
  });

  it("remembers an ID first observed ineligible after it returns to QUEUED", () => {
    const tracker = createRetrievalAlertTracker();
    observeRetrievalSnapshot(tracker, [], 1);
    observeRetrievalSnapshot(
      tracker,
      [task(TASK_ID_A, { status: "ASSIGNED" })],
      2,
    );
    expect(observeRetrievalSnapshot(tracker, [task(TASK_ID_A)], 3)).toEqual([]);
  });

  it("alerts each eligible ID in one recovered canonical snapshot", () => {
    const tracker = createRetrievalAlertTracker();
    observeRetrievalSnapshot(tracker, [], 1);
    expect(
      observeRetrievalSnapshot(
        tracker,
        [task(TASK_ID_A), task(TASK_ID_B)],
        2,
      ),
    ).toEqual([TASK_ID_A, TASK_ID_B]);
  });

  it("keeps a visually dismissed alert observed across later polling", () => {
    const tracker = createRetrievalAlertTracker();
    observeRetrievalSnapshot(tracker, [], 1);
    let visibleIds = observeRetrievalSnapshot(tracker, [task(TASK_ID_A)], 2);
    expect(visibleIds).toEqual([TASK_ID_A]);

    visibleIds = visibleIds.filter((taskId) => taskId !== TASK_ID_A);
    expect(visibleIds).toEqual([]);
    expect(tracker.observedTaskIds.has(TASK_ID_A)).toBe(true);
    expect(observeRetrievalSnapshot(tracker, [task(TASK_ID_A)], 3)).toEqual([]);
  });

  it("a new workspace tracker baselines instead of carrying old seen state", () => {
    const oldWorkspace = createRetrievalAlertTracker();
    observeRetrievalSnapshot(oldWorkspace, [], 1);
    expect(observeRetrievalSnapshot(oldWorkspace, [task(TASK_ID_A)], 2)).toEqual([
      TASK_ID_A,
    ]);

    const newWorkspace = createRetrievalAlertTracker();
    expect(
      observeRetrievalSnapshot(newWorkspace, [task(TASK_ID_A)], 1),
    ).toEqual([]);
  });
});
