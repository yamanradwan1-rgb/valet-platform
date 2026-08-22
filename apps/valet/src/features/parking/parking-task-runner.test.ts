import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { executeParkingTaskAction } from "./parking-task-runner";

describe("executeParkingTaskAction", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const myMembershipId = "33333333-3333-4333-8333-333333333333";
  const otherMembershipId = "44444444-4444-4444-8444-444444444444";

  const sessionDetail = {
    checkIn: { conditionCompletedAt: "2026-08-21T18:00:00.000Z" },
    handoff: { pendingAt: null, verification: null },
    keySlot: { code: "K-1" },
    locationId: "55555555-5555-4555-8555-555555555555",
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: null,
      parkingZoneCode: null,
    },
    sessionId,
    state: "AWAITING_PARKING",
    vehicle: {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId: "66666666-6666-4666-8666-666666666666",
      vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
    },
    version: 3,
  };

  it("assigns, accepts, and starts parking for a QUEUED task", async () => {
    const mockClient = {
      request: vi
        .fn()
        // 1. fetchSessionDetail
        .mockResolvedValueOnce(sessionDetail)
        // 2. assignParkingTask (v1 -> v2)
        .mockResolvedValueOnce({
          createdAt: "2026-08-21T18:00:00.000Z",
          currentAssigneeMembershipId: myMembershipId,
          sessionId,
          status: "ASSIGNED",
          taskId,
          taskType: "PARKING",
          version: 2,
        })
        // 3. acceptParkingTask (v2 -> v3)
        .mockResolvedValueOnce({
          createdAt: "2026-08-21T18:00:00.000Z",
          currentAssigneeMembershipId: myMembershipId,
          sessionId,
          status: "ACCEPTED",
          taskId,
          taskType: "PARKING",
          version: 3,
        })
        // 4. startParkingSession (v3 -> v4)
        .mockResolvedValueOnce({
          parkingStartedAt: "2026-08-21T18:05:00.000Z",
          sessionId,
          sessionVersion: 4,
          state: "PARKING",
          taskId,
          taskStatus: "IN_PROGRESS",
          taskVersion: 4,
        }),
    } as unknown as EmployeeApiClient;

    const res = await executeParkingTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: null,
        sessionId,
        status: "QUEUED",
        taskId,
        version: 1,
      },
      myMembershipId,
    );

    expect(res.kind).toBe("START_PARKING_SUCCESS");
    if (res.kind === "START_PARKING_SUCCESS") {
      expect(res.payload.parkingStartedAt).toBe("2026-08-21T18:05:00.000Z");
      expect(res.payload.taskVersion).toBe(4);
      expect(res.payload.sessionVersion).toBe(4);
    }
  });

  it("accepts and starts parking for an ASSIGNED task owned by actor", async () => {
    const mockClient = {
      request: vi
        .fn()
        // 1. fetchSessionDetail
        .mockResolvedValueOnce(sessionDetail)
        // 2. acceptParkingTask (v2 -> v3)
        .mockResolvedValueOnce({
          createdAt: "2026-08-21T18:00:00.000Z",
          currentAssigneeMembershipId: myMembershipId,
          sessionId,
          status: "ACCEPTED",
          taskId,
          taskType: "PARKING",
          version: 3,
        })
        // 3. startParkingSession (v3 -> v4)
        .mockResolvedValueOnce({
          parkingStartedAt: "2026-08-21T18:05:00.000Z",
          sessionId,
          sessionVersion: 4,
          state: "PARKING",
          taskId,
          taskStatus: "IN_PROGRESS",
          taskVersion: 4,
        }),
    } as unknown as EmployeeApiClient;

    const res = await executeParkingTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: myMembershipId,
        sessionId,
        status: "ASSIGNED",
        taskId,
        version: 2,
      },
      myMembershipId,
    );

    expect(res.kind).toBe("START_PARKING_SUCCESS");
  });

  it("starts parking directly for an ACCEPTED task owned by actor", async () => {
    const mockClient = {
      request: vi
        .fn()
        // 1. fetchSessionDetail
        .mockResolvedValueOnce(sessionDetail)
        // 2. startParkingSession (v3 -> v4)
        .mockResolvedValueOnce({
          parkingStartedAt: "2026-08-21T18:05:00.000Z",
          sessionId,
          sessionVersion: 4,
          state: "PARKING",
          taskId,
          taskStatus: "IN_PROGRESS",
          taskVersion: 4,
        }),
    } as unknown as EmployeeApiClient;

    const res = await executeParkingTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: myMembershipId,
        sessionId,
        status: "ACCEPTED",
        taskId,
        version: 3,
      },
      myMembershipId,
    );

    expect(res.kind).toBe("START_PARKING_SUCCESS");
  });

  it("returns NAVIGATE_IN_PROGRESS for IN_PROGRESS task owned by actor", async () => {
    const mockClient = {
      request: vi.fn(),
    } as unknown as EmployeeApiClient;

    const res = await executeParkingTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: myMembershipId,
        sessionId,
        status: "IN_PROGRESS",
        taskId,
        version: 4,
      },
      myMembershipId,
    );

    expect(res.kind).toBe("NAVIGATE_IN_PROGRESS");
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("denies action on task assigned to another employee", async () => {
    const mockClient = {
      request: vi.fn(),
    } as unknown as EmployeeApiClient;

    const res = await executeParkingTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: otherMembershipId,
        sessionId,
        status: "ASSIGNED",
        taskId,
        version: 2,
      },
      myMembershipId,
    );

    expect(res.kind).toBe("DENIED");
    expect(mockClient.request).not.toHaveBeenCalled();
  });
});
