import { describe, expect, it, vi } from "vitest";
import type {
  AcceptTaskResponse,
  AssignTaskResponse,
  StaffTaskQueueItem,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import {
  RetrievalController,
  executeRetrievalTaskAction,
  type MarkReadyResponse,
  type StartRetrievalResponse,
} from "../features/retrieval";
import type { EmployeeApiClient } from "../lib/api/employee-api-client";

describe("Live Retrieval End-to-End Operational Lifecycle", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const locationId = "33333333-3333-4333-8333-333333333333";
  const membershipId = "44444444-4444-4444-8444-444444444444";
  const vehicleId = "55555555-5555-4555-8555-555555555555";

  const queuedTask: StaffTaskQueueItem = {
    createdAt: "2026-08-21T18:00:00.000Z",
    currentAssigneeMembershipId: null,
    parkingSpot: "P-101",
    parkingZone: "Zone A",
    retrievalRequestedAt: "2026-08-21T18:01:00.000Z",
    sessionId,
    status: "QUEUED",
    taskId,
    taskType: "RETRIEVAL",
    valetSessionState: "REQUESTED",
    valetSessionVersion: 4,
    vehicle: {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
    version: 1,
  };

  const assignRes: AssignTaskResponse = {
    createdAt: "2026-08-21T18:01:30.000Z",
    currentAssigneeMembershipId: membershipId,
    sessionId,
    status: "ASSIGNED",
    taskId,
    taskType: "RETRIEVAL",
    version: 2,
  };

  const acceptRes: AcceptTaskResponse = {
    createdAt: "2026-08-21T18:01:31.000Z",
    currentAssigneeMembershipId: membershipId,
    sessionId,
    status: "ACCEPTED",
    taskId,
    taskType: "RETRIEVAL",
    version: 3,
  };

  const requestedDetail: StaffValetSessionDetailResponse = {
    checkIn: { conditionCompletedAt: "2026-08-21T17:50:00.000Z" },
    handoff: { pendingAt: null, verification: null },
    keySlot: { code: "B-214" },
    locationId,
    parking: {
      parkedAt: "2026-08-21T17:55:00.000Z",
      parkingSpotCode: "P-101",
      parkingStartedAt: "2026-08-21T17:52:00.000Z",
      parkingZoneCode: "Zone A",
    },
    sessionId,
    state: "REQUESTED",
    vehicle: {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId,
      vehicleUpdatedAt: "2026-08-21T17:50:00.000Z",
    },
    version: 4,
  };

  const startRes: StartRetrievalResponse = {
    retrievalStartedAt: "2026-08-21T18:02:00.000Z",
    sessionId,
    sessionVersion: 5,
    state: "RETRIEVING",
    taskId,
    taskStatus: "IN_PROGRESS",
    taskVersion: 4,
  };

  const readyRes: MarkReadyResponse = {
    readyAt: "2026-08-21T18:05:00.000Z",
    sessionId,
    sessionVersion: 6,
    state: "READY",
    taskId,
    taskStatus: "IN_PROGRESS",
    taskVersion: 4,
  };

  it("progresses QUEUED retrieval task to ACCEPTED, validates key, starts retrieval, and marks vehicle ready", async () => {
    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(assignRes)
        .mockResolvedValueOnce(acceptRes)
        .mockResolvedValueOnce(requestedDetail)
        .mockResolvedValueOnce(startRes)
        .mockResolvedValueOnce(readyRes),
    } as unknown as EmployeeApiClient;

    // 1. Task Queue action: claim and accept QUEUED retrieval task
    const runnerResult = await executeRetrievalTaskAction(
      mockClient,
      {
        currentAssigneeMembershipId: queuedTask.currentAssigneeMembershipId,
        sessionId: queuedTask.sessionId,
        status: queuedTask.status,
        taskId: queuedTask.taskId,
        version: queuedTask.version,
      },
      membershipId,
    );

    expect(runnerResult.kind).toBe("NAVIGATE_ACCEPTED");
    if (runnerResult.kind !== "NAVIGATE_ACCEPTED") {
      throw new Error("Expected NAVIGATE_ACCEPTED");
    }

    expect(runnerResult.taskVersion).toBe(3);

    // 2. Retrieval Controller hydration on navigation with ownership check
    const controller = new RetrievalController(
      mockClient,
      vi.fn(),
      membershipId,
    );
    await controller.hydrateSession(
      runnerResult.sessionId,
      runnerResult.taskId,
      runnerResult.taskVersion,
      "ACCEPTED",
      membershipId,
    );

    expect(controller.getState().step).toBe("key-checkout");
    expect(controller.getState().activeSession?.expectedKeySlotCode).toBe(
      "B-214",
    );
    expect(controller.getState().activeSession?.isKeyConfirmed).toBe(false);
    expect(controller.getState().activeSession?.parkingSpotCode).toBe("P-101");

    // 3. Key Confirmation: employee verifies key code
    const isVerified = controller.confirmKey("B-214");
    expect(isVerified).toBe(true);
    expect(controller.getState().activeSession?.isKeyConfirmed).toBe(true);

    // 4. Start Retrieval: atomic backend mutation recording key checkout & starting retrieval
    await controller.startRetrieval();

    expect(controller.getState().step).toBe("in-progress");
    expect(controller.getState().activeSession?.state).toBe("RETRIEVING");
    expect(controller.getState().activeSession?.sessionVersion).toBe(5);
    expect(controller.getState().activeSession?.taskVersion).toBe(4);
    expect(controller.getState().activeSession?.taskStatus).toBe("IN_PROGRESS");
    expect(controller.getState().activeSession?.parkingSpotCode).toBeNull(); // Released spot
    expect(controller.getState().activeSession?.parkingZoneCode).toBeNull();
    expect(controller.getState().activeSession?.retrievalStartedAt).toBe(
      "2026-08-21T18:02:00.000Z",
    );

    // 5. Mark Ready: transitions session to READY while task remains IN_PROGRESS
    await controller.markReady();

    expect(controller.getState().step).toBe("vehicle-ready");
    expect(controller.getState().activeSession?.state).toBe("READY");
    expect(controller.getState().activeSession?.sessionVersion).toBe(6);
    expect(controller.getState().activeSession?.taskVersion).toBe(4);
    expect(controller.getState().activeSession?.taskStatus).toBe("IN_PROGRESS");
    expect(controller.getState().activeSession?.parkingSpotCode).toBeNull();
    expect(controller.getState().activeSession?.readyAt).toBe(
      "2026-08-21T18:05:00.000Z",
    );
  });
});
