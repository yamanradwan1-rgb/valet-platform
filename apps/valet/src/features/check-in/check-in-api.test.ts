import { describe, expect, it } from "vitest";
import type {
  AssignTaskResponse,
  ConditionNoteResponse,
  StaffCheckInContinuationsResponse,
  StaffCheckInDraftsResponse,
  StaffValetSessionDetailResponse,
  VehicleIdentityResponse,
} from "@valet/contracts";

import {
  acceptParkingTask,
  assignParkingTask,
  assignSessionKeySlot,
  completeCheckInSession,
  completeConditionStep,
  createIntakeSession,
  createSessionConditionNote,
  fetchCheckInContinuations,
  fetchCheckInDrafts,
  fetchSessionDetail,
  queueSessionParkingTask,
  startParkingSession,
  updateSessionVehicleIdentity,
  type AcceptTaskResponse,
  type AssignKeySlotResponse,
  type CompleteCheckInResponse,
  type ConditionCompletionResponse,
  type IntakeResponse,
  type ParkingTaskQueueResponse,
  type StartParkingResponse,
} from "./check-in-api";
import { createCheckInApiTestClient } from "./check-in-api-test-client";

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
    const mockClient = createCheckInApiTestClient(payload);

    const res = await fetchCheckInDrafts(mockClient, locationId);
    expect(res).toEqual(payload);
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
    const mockClient = createCheckInApiTestClient(payload);

    const res = await fetchCheckInContinuations(mockClient, locationId);
    expect(res).toEqual(payload);
  });

  it("fetchSessionDetail parses valid session detail", async () => {
    const payload: StaffValetSessionDetailResponse = {
      checkIn: { conditionCompletedAt: null },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
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
    const mockClient = createCheckInApiTestClient(payload);

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
    const mockClient = createCheckInApiTestClient(payload);

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

  it("updateSessionVehicleIdentity invokes PUT /v1/staff/check-in/sessions/:sessionId/vehicle-identity", async () => {
    const payload: VehicleIdentityResponse = {
      identityMode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberNormalized: "1234567",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      valetSessionId: sessionId,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-21T18:01:00.000Z",
    };
    const mockClient = createCheckInApiTestClient(payload);

    const res = await updateSessionVehicleIdentity(mockClient, sessionId, {
      expectedVehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      identity: {
        confirmedByHuman: true,
        mode: "CONFIRMED_PLATE",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
      },
    });
    expect(res).toEqual(payload);
  });

  it("createSessionConditionNote invokes POST /v1/staff/check-in/sessions/:sessionId/condition-notes", async () => {
    const payload: ConditionNoteResponse = {
      conditionNoteId: "66666666-6666-4666-8666-666666666666",
      content: "Scratch on bumper",
      createdAt: "2026-08-21T18:02:00.000Z",
      supersedesConditionNoteId: null,
      valetSessionId: sessionId,
    };
    const mockClient = createCheckInApiTestClient(payload);

    const res = await createSessionConditionNote(mockClient, sessionId, {
      content: "Scratch on bumper",
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
    const mockClient = createCheckInApiTestClient(condPayload, completePayload);

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
    const mockClient = createCheckInApiTestClient(payload);

    const res = await assignSessionKeySlot(mockClient, sessionId, 2, "B-214");
    expect(res).toEqual(payload);
  });

  it("assignParkingTask invokes POST /v1/staff/tasks/:taskId/assign", async () => {
    const assignPayload: AssignTaskResponse = {
      createdAt: "2026-08-21T18:07:00.000Z",
      currentAssigneeMembershipId: "88888888-8888-4888-8888-888888888888",
      sessionId,
      status: "ASSIGNED",
      taskId,
      taskType: "PARKING",
      version: 2,
    };
    const mockClient = createCheckInApiTestClient(assignPayload);

    const aRes = await assignParkingTask(mockClient, taskId, 1);
    expect(aRes).toEqual(assignPayload);
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
      version: 3,
    };
    const startPayload: StartParkingResponse = {
      parkingStartedAt: "2026-08-21T18:07:02.000Z",
      sessionId,
      sessionVersion: 4,
      state: "PARKING",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    };

    const mockClient = createCheckInApiTestClient(
      queuePayload,
      acceptPayload,
      startPayload,
    );

    const qRes = await queueSessionParkingTask(mockClient, sessionId);
    expect(qRes).toEqual(queuePayload);

    const aRes = await acceptParkingTask(mockClient, taskId, 2);
    expect(aRes).toEqual(acceptPayload);

    const sRes = await startParkingSession(mockClient, sessionId, 3, 3);
    expect(sRes).toEqual(startPayload);
  });
});
