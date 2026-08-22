import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  acceptRetrievalTask,
  assignRetrievalTask,
  fetchSessionDetail,
  markReadySession,
  startRetrievalSession,
} from "./retrieval-api";

describe("Retrieval API client wrappers", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const locationId = "33333333-3333-4333-8333-333333333333";
  const vehicleId = "44444444-4444-4444-8444-444444444444";

  it("fetches session detail via GET", async () => {
    const mockDetail = {
      checkIn: { conditionCompletedAt: null },
      handoff: { pendingAt: null, verification: null },
      keySlot: { code: "B-214" },
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId,
      state: "REQUESTED",
      vehicle: {
        color: "Black",
        make: "Porsche",
        model: "Taycan",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId,
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 4,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(mockDetail),
    } as unknown as EmployeeApiClient;

    const res = await fetchSessionDetail(mockClient, sessionId);
    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/valet-sessions/${sessionId}`,
      expect.objectContaining({ method: "GET", requireAuth: true }),
    );
    expect(res.sessionId).toBe(sessionId);
    expect(res.state).toBe("REQUESTED");
  });

  it("assigns task via POST", async () => {
    const mockRes = {
      createdAt: "2026-08-21T18:00:00.000Z",
      currentAssigneeMembershipId: "33333333-3333-4333-8333-333333333333",
      sessionId,
      status: "ASSIGNED",
      taskId,
      taskType: "RETRIEVAL",
      version: 2,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(mockRes),
    } as unknown as EmployeeApiClient;

    const res = await assignRetrievalTask(mockClient, taskId, 1);
    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/tasks/${taskId}/assign`,
      expect.objectContaining({
        body: { expectedVersion: 1 },
        method: "POST",
        requireAuth: true,
      }),
    );
    expect(res.version).toBe(2);
  });

  it("accepts task via POST", async () => {
    const mockRes = {
      createdAt: "2026-08-21T18:00:00.000Z",
      currentAssigneeMembershipId: "33333333-3333-4333-8333-333333333333",
      sessionId,
      status: "ACCEPTED",
      taskId,
      taskType: "RETRIEVAL",
      version: 3,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(mockRes),
    } as unknown as EmployeeApiClient;

    const res = await acceptRetrievalTask(mockClient, taskId, 2);
    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/tasks/${taskId}/accept`,
      expect.objectContaining({
        body: { expectedVersion: 2 },
        method: "POST",
        requireAuth: true,
      }),
    );
    expect(res.version).toBe(3);
  });

  it("starts retrieval via POST", async () => {
    const mockRes = {
      retrievalStartedAt: "2026-08-21T18:00:00.000Z",
      sessionId,
      sessionVersion: 5,
      state: "RETRIEVING",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 3,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(mockRes),
    } as unknown as EmployeeApiClient;

    const res = await startRetrievalSession(mockClient, sessionId, 4, 2);
    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/valet-sessions/${sessionId}/start-retrieval`,
      expect.objectContaining({
        body: { expectedSessionVersion: 4, expectedTaskVersion: 2 },
        method: "POST",
        requireAuth: true,
      }),
    );
    expect(res.state).toBe("RETRIEVING");
  });

  it("marks ready via POST", async () => {
    const mockRes = {
      readyAt: "2026-08-21T18:00:00.000Z",
      sessionId,
      sessionVersion: 6,
      state: "READY",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 3,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(mockRes),
    } as unknown as EmployeeApiClient;

    const res = await markReadySession(mockClient, sessionId, 5);
    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/valet-sessions/${sessionId}/mark-ready`,
      expect.objectContaining({
        body: { expectedSessionVersion: 5 },
        method: "POST",
        requireAuth: true,
      }),
    );
    expect(res.state).toBe("READY");
  });
});
