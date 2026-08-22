import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";
import type {
  AcceptTaskResponse,
  AssignKeySlotResponse,
  CompleteCheckInResponse,
  ConditionCompletionResponse,
  IntakeResponse,
  ParkingTaskQueueResponse,
  StartParkingResponse,
} from "./check-in-api";

describe("CheckInController Mutations Lifecycle", () => {
  const locationId = "22222222-2222-4222-8222-222222222222";
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "33333333-3333-4333-8333-333333333333";

  it("progresses full check-in mutations: confirmPlate -> completeCondition -> assignKey -> createParkingTask -> startParking", async () => {
    const intakePayload: IntakeResponse = {
      createdAt: "2026-08-21T18:00:00.000Z",
      customerId: null,
      state: "CHECKING_IN",
      valetSessionId: sessionId,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      version: 1,
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
    const assignPayload: AssignKeySlotResponse = {
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
        .mockResolvedValueOnce(intakePayload)
        .mockResolvedValueOnce(condPayload)
        .mockResolvedValueOnce(compPayload)
        .mockResolvedValueOnce(assignPayload)
        .mockResolvedValueOnce(queuePayload)
        .mockResolvedValueOnce(acceptPayload)
        .mockResolvedValueOnce(startPayload),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());

    // 1. Confirm plate
    await controller.confirmPlate(locationId, {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    });
    expect(controller.getState().step).toBe("customer-phone");
    expect(controller.getState().activeSession?.sessionId).toBe(sessionId);

    // 2. Complete condition
    await controller.completeCondition();
    expect(controller.getState().step).toBe("key-scan");
    expect(controller.getState().activeSession?.state).toBe("AWAITING_PARKING");

    // 3. Assign key
    await controller.assignKey("B-214");
    expect(controller.getState().step).toBe("key-assigned");
    expect(controller.getState().activeSession?.keySlotCode).toBe("B-214");

    // 4. Create parking task
    await controller.createParkingTask();
    expect(controller.getState().step).toBe("parking-task");
    expect(controller.getState().activeSession?.parkingTaskId).toBe(taskId);

    // 5. Start parking
    const payload = await controller.startParking();
    expect(payload).not.toBeNull();
    expect(payload?.sessionId).toBe(sessionId);
    expect(payload?.taskId).toBe(taskId);
    expect(payload?.taskVersion).toBe(3);
    expect(payload?.sessionVersion).toBe(4);
  });
});
