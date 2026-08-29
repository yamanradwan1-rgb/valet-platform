import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";
import type {
  AcceptTaskResponse,
  AssignTaskResponse,
  CompleteCheckInResponse,
  ConditionCompletionResponse,
  ConditionNoteResponse,
  IntakeResponse,
  ParkingTaskQueueResponse,
  StartParkingResponse,
} from "./check-in-api";

function expectZeroKeySlotAssignmentCalls(client: EmployeeApiClient): void {
  const calls = (client.request as unknown as { mock: { calls: unknown[][] } })
    .mock.calls;
  const keySlotCalls = calls.filter((call) =>
    String(call[0]).includes("/key-slot/"),
  );
  // DEC-068 §5: Check-In reaches the Parking Task step without any Key Slot
  // assignment mutation.
  expect(keySlotCalls).toHaveLength(0);
}

describe("CheckInController Mutations Lifecycle", () => {
  const locationId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "33333333-3333-4333-8333-333333333333";

  it("progresses full check-in mutations", async () => {
    const intakePayload: IntakeResponse = {
      createdAt: "2026-08-21T18:00:00.000Z",
      color: null,
      customerId: "77777777-7777-4777-8777-777777777777",
      make: null,
      model: null,
      state: "CHECKING_IN",
      valetSessionId: sessionId,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      version: 1,
    };
    const notePayload: ConditionNoteResponse = {
      conditionNoteId: "88888888-8888-4888-8888-888888888888",
      content: "Existing damage on fender",
      createdAt: "2026-08-21T18:04:00.000Z",
      supersedesConditionNoteId: null,
      valetSessionId: sessionId,
    };
    const condPayload: ConditionCompletionResponse = {
      completedAt: "2026-08-21T18:05:00.000Z",
      valetSessionId: sessionId,
    };
    const compPayload: CompleteCheckInResponse = {
      checkingInCompletedAt: "2026-08-21T18:05:00.000Z",
      state: "AWAITING_PARKING",
      valetSessionId: sessionId,
      version: 2,
    };
    const queuePayload: ParkingTaskQueueResponse = {
      createdAt: "2026-08-21T18:07:00.000Z",
      currentAssigneeMembershipId: null,
      sessionId,
      status: "QUEUED",
      taskId,
      taskType: "PARKING",
      version: 1,
    };
    const detailPayload = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:05:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      keySlot: null,
      locationId,
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: "North-A",
      },
      sessionId,
      state: "AWAITING_PARKING" as const,
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
      version: 3,
    };
    const assignTaskPayload: AssignTaskResponse = {
      createdAt: "2026-08-21T18:07:00.000Z",
      currentAssigneeMembershipId: "88888888-8888-4888-8888-888888888888",
      sessionId,
      status: "ASSIGNED",
      taskId,
      taskType: "PARKING",
      version: 2,
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

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ vehicle: null })
        .mockResolvedValueOnce(intakePayload)
        .mockResolvedValueOnce(notePayload)
        .mockResolvedValueOnce(condPayload)
        .mockResolvedValueOnce(compPayload)
        .mockResolvedValueOnce(queuePayload)
        .mockResolvedValueOnce(queuePayload)
        .mockResolvedValueOnce(detailPayload)
        .mockResolvedValueOnce(assignTaskPayload)
        .mockResolvedValueOnce(acceptPayload)
        .mockResolvedValueOnce(startPayload),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());

    await controller.confirmPlate(locationId, {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    });
    expect(controller.getState().step).toBe("vehicle-details");
    controller.continueToCustomer("vehicle-details");

    await controller.submitCustomerPhone(locationId, "+962790000000");
    expect(controller.getState().step).toBe("vehicle-condition");

    await controller.completeCondition("Existing damage on fender");
    expect(controller.getState().step).toBe("parking-task");
    expect(controller.getState().activeSession?.state).toBe("AWAITING_PARKING");

    expectZeroKeySlotAssignmentCalls(mockClient);

    await controller.createParkingTask();
    expect(controller.getState().step).toBe("parking-task");

    const payload = await controller.startParking();
    expect(payload?.taskId).toBe(taskId);
    expect(payload?.sessionVersion).toBe(4);
    expectZeroKeySlotAssignmentCalls(mockClient);
  });

  it("handles CHECKING_IN draft with conditionCompletedAt without skipping complete-check-in", async () => {
    const detailPayload = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:05:00.000Z" },
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
      state: "CHECKING_IN" as const,
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
    const compPayload: CompleteCheckInResponse = {
      checkingInCompletedAt: "2026-08-21T18:06:00.000Z",
      state: "AWAITING_PARKING",
      valetSessionId: sessionId,
      version: 2,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce(detailPayload)
        .mockResolvedValueOnce(compPayload),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.hydrateFromDraft(locationId, {
      conditionCompletedAt: "2026-08-21T18:05:00.000Z",
      createdAt: "2026-08-21T18:00:00.000Z",
      sessionId,
      vehicle: detailPayload.vehicle,
    });

    expect(controller.getState().step).toBe("vehicle-condition");
    expect(controller.getState().activeSession?.state).toBe("CHECKING_IN");

    // Completing condition calls ONLY complete-check-in (no redundant condition note)
    await controller.completeCondition();
    expect(mockClient.request).toHaveBeenCalledTimes(2);
    expect(mockClient.request).toHaveBeenLastCalledWith(
      `/v1/staff/check-in/sessions/${sessionId}/complete`,
      expect.objectContaining({ body: { expectedVersion: 1 }, method: "POST" }),
    );
    expect(controller.getState().step).toBe("parking-task");
    expect(controller.getState().activeSession?.state).toBe("AWAITING_PARKING");
    expectZeroKeySlotAssignmentCalls(mockClient);
  });
});
