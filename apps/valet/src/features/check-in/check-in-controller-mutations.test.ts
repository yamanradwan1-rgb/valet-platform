import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";
import type {
  AcceptTaskResponse,
  AssignKeySlotResponse,
  AssignTaskResponse,
  CompleteCheckInResponse,
  ConditionCompletionResponse,
  ConditionNoteResponse,
  IntakeResponse,
  ParkingTaskQueueResponse,
  StartParkingResponse,
  VehicleIdentityResponse,
} from "./check-in-api";

describe("CheckInController Mutations Lifecycle", () => {
  const locationId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "33333333-3333-4333-8333-333333333333";

  it("progresses full check-in mutations: confirmPlate -> phone & intake -> completeCondition with note -> assignKey -> createParkingTask -> startParking", async () => {
    const intakePayload: IntakeResponse = {
      createdAt: "2026-08-21T18:00:00.000Z",
      customerId: "77777777-7777-4777-8777-777777777777",
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
    const assignKeyPayload: AssignKeySlotResponse = {
      keySlotCode: "B-214",
      sessionId,
      state: "AWAITING_PARKING",
      version: 3,
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
        // 1. intake
        .mockResolvedValueOnce(intakePayload)
        // 2. condition note
        .mockResolvedValueOnce(notePayload)
        // 3. condition completion
        .mockResolvedValueOnce(condPayload)
        // 4. complete check-in
        .mockResolvedValueOnce(compPayload)
        // 5. assign key slot
        .mockResolvedValueOnce(assignKeyPayload)
        // 6. queue task
        .mockResolvedValueOnce(queuePayload)
        // 7. assign task to self
        .mockResolvedValueOnce(assignTaskPayload)
        // 8. accept task
        .mockResolvedValueOnce(acceptPayload)
        // 9. start parking
        .mockResolvedValueOnce(startPayload),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());

    // 1. Confirm plate stores pendingVehicle locally
    await controller.confirmPlate({
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    });
    expect(controller.getState().step).toBe("customer-phone");
    expect(controller.getState().pendingVehicle?.plateNumberRaw).toBe("12-34567");
    expect(controller.getState().activeSession).toBeNull();

    // 2. Submit customer phone -> creates authoritative intake
    await controller.submitCustomerPhone(locationId, "+962790000000");
    expect(controller.getState().step).toBe("vehicle-condition");
    expect(controller.getState().activeSession?.sessionId).toBe(sessionId);
    expect(controller.getState().activeSession?.customerPhone).toBe("+962790000000");

    // 3. Complete condition with note
    await controller.completeCondition("Existing damage on fender");
    expect(controller.getState().step).toBe("key-scan");
    expect(controller.getState().activeSession?.state).toBe("AWAITING_PARKING");

    // 4. Assign key
    await controller.assignKey("B-214");
    expect(controller.getState().step).toBe("key-assigned");
    expect(controller.getState().activeSession?.keySlotCode).toBe("B-214");

    // 5. Create parking task
    await controller.createParkingTask();
    expect(controller.getState().step).toBe("parking-task");
    expect(controller.getState().activeSession?.parkingTaskId).toBe(taskId);

    // 6. Start parking
    const payload = await controller.startParking();
    expect(payload).not.toBeNull();
    expect(payload?.sessionId).toBe(sessionId);
    expect(payload?.taskId).toBe(taskId);
    expect(payload?.taskVersion).toBe(4);
    expect(payload?.sessionVersion).toBe(4);
  });

  it("updates vehicle identity with expectedVehicleUpdatedAt when editing resumed session", async () => {
    const updatePayload: VehicleIdentityResponse = {
      identityMode: "CONFIRMED_PLATE",
      plateCountry: "JO",
      plateNumberNormalized: "9988888",
      plateNumberRaw: "99-88888",
      temporaryDescriptor: null,
      valetSessionId: sessionId,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-21T18:02:00.000Z",
    };

    const mockClient = {
      request: vi.fn().mockResolvedValue(updatePayload),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());

    // Hydrate active session
    await controller.hydrateFromDraft(locationId, {
      conditionCompletedAt: null,
      createdAt: "2026-08-21T18:00:00.000Z",
      sessionId,
      vehicle: {
        color: "Black",
        make: "BMW",
        model: "X5",
        plateCountry: "JO",
        plateNumberRaw: "12-34567",
        temporaryDescriptor: null,
      },
    });

    // Mock fetchSessionDetail in hydrateFromDraft
    const detailPayload = {
      checkIn: { conditionCompletedAt: null },
      keySlot: null,
      locationId,
      parking: { parkedAt: null, parkingSpotCode: null, parkingStartedAt: null, parkingZoneCode: null },
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
    (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(detailPayload);
    await controller.hydrateFromDraft(locationId, {
      conditionCompletedAt: null,
      createdAt: "2026-08-21T18:00:00.000Z",
      sessionId,
      vehicle: detailPayload.vehicle,
    });

    // Edit plate on resumed draft
    (mockClient.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(updatePayload);
    await controller.confirmPlate({
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "99-88888",
      temporaryDescriptor: null,
    });

    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/check-in/sessions/${sessionId}/vehicle-identity`,
      expect.objectContaining({
        body: {
          expectedVehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
          identity: {
            confirmedByHuman: true,
            mode: "CONFIRMED_PLATE",
            plateCountry: "JO",
            plateNumberRaw: "99-88888",
          },
        },
        method: "PUT",
      }),
    );
    expect(controller.getState().activeSession?.vehicle.plateNumberRaw).toBe("99-88888");
    expect(controller.getState().activeSession?.vehicleUpdatedAt).toBe("2026-08-21T18:02:00.000Z");
  });
});
