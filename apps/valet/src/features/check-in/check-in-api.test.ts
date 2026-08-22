import { describe, expect, it, vi } from "vitest";
import type {
  StaffCheckInContinuationsResponse,
  StaffCheckInDraftsResponse,
  StaffValetSessionDetailResponse,
} from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import {
  acceptParkingTask,
  assignSessionKeySlot,
  completeCheckInSession,
  completeConditionStep,
  createIntakeSession,
  fetchCheckInContinuations,
  fetchCheckInDrafts,
  fetchSessionDetail,
  queueSessionParkingTask,
  startParkingSession,
  type AcceptTaskResponse,
  type AssignKeySlotResponse,
  type CompleteCheckInResponse,
  type ConditionCompletionResponse,
  type IntakeResponse,
  type ParkingTaskQueueResponse,
  type StartParkingResponse,
} from "./check-in-api";

describe("Check-In API Client", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const locationId = "22222222-2222-4222-8222-222222222222";
  const taskId = "33333333-3333-4333-8333-333333333333";

  it("fetchCheckInDrafts parses valid drafts response", async () => {
    const payload: StaffCheckInDraftsResponse = {
      drafts: [
        {
          conditionCompletedAt: null,
          createdAt: "2026-08-21T18:00:00.000Z",
          sessionId,
          vehicle: {
            color: "Black",
            make: "Porsche",
            model: "Taycan",
            plateCountry: "JO",
            plateNumberRaw: "12-34567",
            temporaryDescriptor: null,
          },
        },
      ],
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await fetchCheckInDrafts(mockClient, locationId);
    expect(res).toEqual(payload);
    expect(mockClient.request).toHaveBeenCalledWith(
      "/v1/staff/check-in/drafts",
      expect.objectContaining({
        method: "GET",
        params: { locationId },
        requireAuth: true,
      }),
    );
  });

  it("fetchCheckInContinuations parses valid continuations response", async () => {
    const payload: StaffCheckInContinuationsResponse = {
      continuations: [
        {
          createdAt: "2026-08-21T18:00:00.000Z",
          sessionId,
          vehicle: {
            color: "White",
            make: "BMW",
            model: "X5",
            plateCountry: "JO",
            plateNumberRaw: "55-99999",
            temporaryDescriptor: null,
          },
        },
      ],
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await fetchCheckInContinuations(mockClient, locationId);
    expect(res).toEqual(payload);
  });

  it("fetchSessionDetail parses valid session detail", async () => {
    const payload: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: null },
      keySlot: null,
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId,
      state: "CHECKING_IN",
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
      version: 1,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await fetchSessionDetail(mockClient, sessionId);
    expect(res).toEqual(payload);
  });

  it("createIntakeSession invokes POST /v1/staff/check-in/intakes", async () => {
    const payload: IntakeResponse = {
      createdAt: "2026-08-21T18:00:00.000Z",
      customerId: null,
      state: "CHECKING_IN",
      valetSessionId: sessionId,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      version: 1,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await createIntakeSession(mockClient, {
      intakeOperationId: "55555555-5555-4555-8555-555555555555",
      targetLocationId: locationId,
      vehicleIdentity: {
        confirmedByHuman: true,
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
      },
    });
    expect(res).toEqual(payload);
  });

  it("completeConditionStep and completeCheckInSession invoke respective endpoints", async () => {
    const condPayload: ConditionCompletionResponse = {
      completedAt: "2026-08-21T18:05:00.000Z",
      valetSessionId: sessionId,
    };
    const completePayload: CompleteCheckInResponse = {
      checkingInCompletedAt: "2026-08-21T18:05:00.000Z",
      state: "AWAITING_PARKING",
      valetSessionId: sessionId,
      version: 2,
    };
    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(condPayload)
        .mockResolvedValueOnce(completePayload),
    } as unknown as EmployeeApiClient;

    const condRes = await completeConditionStep(mockClient, sessionId);
    expect(condRes).toEqual(condPayload);

    const compRes = await completeCheckInSession(mockClient, sessionId, 1);
    expect(compRes).toEqual(completePayload);
  });

  it("assignSessionKeySlot invokes key slot assignment", async () => {
    const payload: AssignKeySlotResponse = {
      keySlotCode: "B-214",
      sessionId,
      state: "AWAITING_PARKING",
      version: 3,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValue(payload),
    } as unknown as EmployeeApiClient;

    const res = await assignSessionKeySlot(mockClient, sessionId, 2, "B-214");
    expect(res).toEqual(payload);
  });

  it("queueSessionParkingTask, acceptParkingTask, and startParkingSession work correctly", async () => {
    const queuePayload: ParkingTaskQueueResponse = {
      createdAt: "2026-08-21T18:07:00.000Z",
      currentAssigneeMembershipId: null,
      sessionId,
      status: "QUEUED",
      taskId,
      taskType: "PARKING",
      version: 1,
    };
    const acceptPayload: AcceptTaskResponse = {
      createdAt: "2026-08-21T18:07:00.000Z",
      currentAssigneeMembershipId: "88888888-8888-4888-8888-888888888888",
      sessionId,
      status: "ACCEPTED",
      taskId,
      taskType: "PARKING",
      version: 2,
    };
    const startPayload: StartParkingResponse = {
      parkingStartedAt: "2026-08-21T18:07:02.000Z",
      sessionId,
      sessionVersion: 4,
      state: "PARKING",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 3,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(queuePayload)
        .mockResolvedValueOnce(acceptPayload)
        .mockResolvedValueOnce(startPayload),
    } as unknown as EmployeeApiClient;

    const qRes = await queueSessionParkingTask(mockClient, sessionId);
    expect(qRes).toEqual(queuePayload);

    const aRes = await acceptParkingTask(mockClient, taskId, 1);
    expect(aRes).toEqual(acceptPayload);

    const sRes = await startParkingSession(mockClient, sessionId, 3, 2);
    expect(sRes).toEqual(startPayload);
  });
});
