import type { StaffTaskQueueItem } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import {
  formatElapsedAge,
  formatRelativeMinutesAgo,
  toStaffTaskQueueItemViewModel,
} from "./task-queue-view-model";

describe("Task Queue View Model", () => {
  const fixedNow = new Date("2026-08-21T20:00:00.000Z").getTime();

  it("formats elapsed age accurately as mm:ss", () => {
    // Exactly 2 minutes and 14 seconds ago (134s)
    const createdIso = new Date(fixedNow - 134 * 1000).toISOString();
    expect(formatElapsedAge(createdIso, fixedNow)).toBe("02:14");

    // 45 seconds ago
    const createdRecentIso = new Date(fixedNow - 45 * 1000).toISOString();
    expect(formatElapsedAge(createdRecentIso, fixedNow)).toBe("00:45");
  });

  it("formats relative minutes ago with correct thresholds", () => {
    const justNowIso = new Date(fixedNow - 30 * 1000).toISOString();
    expect(formatRelativeMinutesAgo(justNowIso, "Requested", fixedNow)).toBe(
      "Requested just now",
    );

    const oneMinIso = new Date(fixedNow - 75 * 1000).toISOString();
    expect(formatRelativeMinutesAgo(oneMinIso, "Requested", fixedNow)).toBe(
      "Requested 1 min ago",
    );

    const fiveMinIso = new Date(fixedNow - 5 * 60 * 1000).toISOString();
    expect(formatRelativeMinutesAgo(fiveMinIso, "Queued", fixedNow)).toBe(
      "Queued 5 min ago",
    );
  });

  it("transforms a complete retrieval task into a view model", () => {
    const task: StaffTaskQueueItem = {
      taskId: "11111111-1111-4111-8111-111111111111",
      valetSessionState: "REQUESTED",
      valetSessionVersion: 4,
      sessionId: "22222222-2222-4222-8222-222222222222",
      taskType: "RETRIEVAL",
      status: "ASSIGNED",
      currentAssigneeMembershipId: "33333333-3333-4333-8333-333333333333",
      version: 1,
      createdAt: new Date(fixedNow - 134 * 1000).toISOString(),
      parkingZone: "Zone B",
      parkingSpot: "Spot B-17",
      retrievalRequestedAt: new Date(fixedNow - 120 * 1000).toISOString(),
      vehicle: {
        make: "BMW",
        model: "X5",
        color: "Black",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
      },
    };

    const vm = toStaffTaskQueueItemViewModel(
      task,
      "33333333-3333-4333-8333-333333333333",
      fixedNow,
    );

    expect(vm.taskId).toBe(task.taskId);
    expect(vm.taskType).toBe("RETRIEVAL");
    expect(vm.badgeVariant).toBe("retrieval");
    expect(vm.status).toBe("ASSIGNED");
    expect(vm.vehicleHeading).toBe("BMW X5");
    expect(vm.vehicleIdentifier).toBe("12-34567");
    expect(vm.vehicleColor).toBe("Black");
    expect(vm.timeText).toBe("Requested 2 min ago");
    expect(vm.elapsedAge).toBe("02:14");
    expect(vm.parkingContext).toBe("Zone B · Spot B-17");
    expect(vm.metaText).toBe("Zone B · Spot B-17");
    expect(vm.isAssignedToMe).toBe(true);
  });

  it("handles null vehicle make/model by falling back to temporaryDescriptor", () => {
    const task: StaffTaskQueueItem = {
      taskId: "11111111-1111-4111-8111-111111111111",
      valetSessionState: "REQUESTED",
      valetSessionVersion: 4,
      sessionId: "22222222-2222-4222-8222-222222222222",
      taskType: "PARKING",
      status: "QUEUED",
      currentAssigneeMembershipId: null,
      version: 1,
      createdAt: new Date(fixedNow - 60 * 1000).toISOString(),
      parkingZone: null,
      parkingSpot: null,
      retrievalRequestedAt: null,
      vehicle: {
        make: null,
        model: null,
        color: null,
        plateNumberRaw: null,
        temporaryDescriptor: "Red Sedan with roof rack",
      },
    };

    const vm = toStaffTaskQueueItemViewModel(task, undefined, fixedNow);

    expect(vm.vehicleHeading).toBe("Red Sedan with roof rack");
    expect(vm.vehicleIdentifier).toBe("Red Sedan with roof rack");
    expect(vm.vehicleColor).toBeUndefined();
    expect(vm.timeText).toBe("Queued 1 min ago");
    expect(vm.parkingContext).toBeNull();
    expect(vm.metaText).toBe("QUEUED");
    expect(vm.isAssignedToMe).toBe(false);
  });

  it("handles completely empty vehicle fields without inventing mock data", () => {
    const task: StaffTaskQueueItem = {
      taskId: "11111111-1111-4111-8111-111111111111",
      valetSessionState: "REQUESTED",
      valetSessionVersion: 4,
      sessionId: "22222222-2222-4222-8222-222222222222",
      taskType: "PARKING",
      status: "QUEUED",
      currentAssigneeMembershipId: null,
      version: 1,
      createdAt: new Date(fixedNow - 10 * 1000).toISOString(),
      parkingZone: null,
      parkingSpot: null,
      retrievalRequestedAt: null,
      vehicle: {
        make: null,
        model: null,
        color: null,
        plateNumberRaw: null,
        temporaryDescriptor: null,
      },
    };

    const vm = toStaffTaskQueueItemViewModel(task, undefined, fixedNow);

    expect(vm.vehicleHeading).toBe("");
    expect(vm.vehicleIdentifier).toBe("");
    expect(vm.vehicleColor).toBeUndefined();
  });
});
