import { describe, expect, it, vi } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  acceptParkingTask,
  assignParkingTask,
  confirmParkedSession,
  fetchSessionDetail,
  startParkingSession,
  type AcceptTaskResponse,
  type AssignTaskResponse,
  type ConfirmParkedResponse,
  type StartParkingResponse,
} from "./parking-api";

describe("Parking API Client", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const locationId = "33333333-3333-4333-8333-333333333333";

  it("fetchSessionDetail parses valid session detail", async () => {
    const payload: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:00:00.000Z" },
      keySlot: { code: "B-214" },
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: "2026-08-21T18:05:00.000Z",
        parkingZoneCode: "Zone B",
      },
      sessionId,
      state: "PARKING",
      vehicle: {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
        vehicleId: "44444444-4444-4444-8444-444444444444",
        vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      },
      version: 4,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await fetchSessionDetail(mockClient, sessionId);
    expect(res).toEqual(payload);
  });

  it("assignParkingTask invokes task assign endpoint", async () => {
    const payload: AssignTaskResponse = {
      createdAt: "2026-08-21T18:05:00.000Z",
      currentAssigneeMembershipId: "55555555-5555-4555-8555-555555555555",
      sessionId,
      status: "ASSIGNED",
      taskId,
      taskType: "PARKING",
      version: 2,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await assignParkingTask(mockClient, taskId, 1);
    expect(res).toEqual(payload);
  });

  it("acceptParkingTask invokes task accept endpoint", async () => {
    const payload: AcceptTaskResponse = {
      createdAt: "2026-08-21T18:05:00.000Z",
      currentAssigneeMembershipId: "55555555-5555-4555-8555-555555555555",
      sessionId,
      status: "ACCEPTED",
      taskId,
      taskType: "PARKING",
      version: 3,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await acceptParkingTask(mockClient, taskId, 2);
    expect(res).toEqual(payload);
  });

  it("startParkingSession invokes start-parking endpoint", async () => {
    const payload: StartParkingResponse = {
      parkingStartedAt: "2026-08-21T18:05:00.000Z",
      sessionId,
      sessionVersion: 4,
      state: "PARKING",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await startParkingSession(mockClient, sessionId, 3, 3);
    expect(res).toEqual(payload);
  });

  it("confirmParkedSession invokes confirm-parked endpoint", async () => {
    const payload: ConfirmParkedResponse = {
      parkedAt: "2026-08-21T18:10:00.000Z",
      parkingSpotCode: "B-17",
      parkingSpotId: "66666666-6666-4666-8666-666666666666",
      parkingZoneId: "77777777-7777-4777-8777-777777777777",
      sessionId,
      sessionVersion: 5,
      state: "PARKED",
      taskId,
      taskStatus: "COMPLETED",
      taskVersion: 5,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await confirmParkedSession(mockClient, sessionId, 4, 4, "B-17");
    expect(res).toEqual(payload);
  });
});
