import { describe, expect, it, vi } from "vitest";
import type {
  AssignKeySlotResponse,
  AssignTaskResponse,
  ConfirmParkedResponse,
  IntakeResponse,
  ParkingTaskQueueResponse,
  StartParkingResponse,
} from "@valet/contracts";

import { CheckInController } from "../features/check-in/check-in-controller";
import { ParkingController } from "../features/parking/parking-controller";
import type { EmployeeApiClient } from "../lib/api/employee-api-client";

describe("Employee Live Operational Check-In and Parking Flow", () => {
  const locationId = "11111111-1111-4111-8111-111111111111";
  const sessionId = "22222222-2222-4222-8222-222222222222";
  const taskId = "33333333-3333-4333-8333-333333333333";

  it("proves end-to-end connected lifecycle without local simulation", async () => {
    const intakePayload: IntakeResponse = {
      createdAt: "2026-08-21T18:00:00.000Z",
      customerId: "99999999-9999-4999-8999-999999999999",
      state: "CHECKING_IN",
      valetSessionId: sessionId,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
      version: 1,
    };
    const assignKeyPayload: AssignKeySlotResponse = {
      keySlotCode: "B-214",
      sessionId,
      state: "AWAITING_PARKING",
      version: 3,
    };
    const queueTaskPayload: ParkingTaskQueueResponse = {
      createdAt: "2026-08-21T18:05:00.000Z",
      currentAssigneeMembershipId: null,
      sessionId,
      status: "QUEUED",
      taskId,
      taskType: "PARKING",
      version: 1,
    };
    const detailPayload = {
      checkIn: { conditionCompletedAt: "2026-08-21T18:02:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
      keySlot: { code: "B-214" },
      locationId,
      parking: { parkedAt: null, parkingSpotCode: null, parkingStartedAt: null, parkingZoneCode: "North-A" },
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
      createdAt: "2026-08-21T18:05:30.000Z",
      currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
      sessionId,
      status: "ASSIGNED",
      taskId,
      taskType: "PARKING",
      version: 2,
    };
    const startParkingPayload: StartParkingResponse = {
      parkingStartedAt: "2026-08-21T18:06:00.000Z",
      sessionId,
      sessionVersion: 4,
      state: "PARKING",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 4,
    };
    const confirmParkedPayload: ConfirmParkedResponse = {
      parkedAt: "2026-08-21T18:10:00.000Z",
      parkingSpotCode: "P-101",
      parkingSpotId: "55555555-5555-4555-8555-555555555555",
      parkingZoneId: "66666666-6666-4666-8666-666666666666",
      sessionId,
      sessionVersion: 5,
      state: "PARKED",
      taskId,
      taskStatus: "COMPLETED",
      taskVersion: 5,
    };

    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce({ drafts: [] }) // drafts
        .mockResolvedValueOnce({ continuations: [] }) // continuations
        .mockResolvedValueOnce(intakePayload) // intake
        .mockResolvedValueOnce({
          conditionNoteId: "88888888-8888-4888-8888-888888888888",
          content: "No scratches",
          createdAt: "2026-08-21T18:01:30.000Z",
          supersedesConditionNoteId: null,
          valetSessionId: sessionId,
        }) // condition note
        .mockResolvedValueOnce({
          completedAt: "2026-08-21T18:02:00.000Z",
          valetSessionId: sessionId,
        }) // condition completion
        .mockResolvedValueOnce({
          checkingInCompletedAt: "2026-08-21T18:02:00.000Z",
          state: "AWAITING_PARKING",
          valetSessionId: sessionId,
          version: 2,
        }) // complete check-in
        .mockResolvedValueOnce(assignKeyPayload) // assign key
        .mockResolvedValueOnce(queueTaskPayload) // queue task
        .mockResolvedValueOnce(queueTaskPayload) // queue task again on startParking
        .mockResolvedValueOnce(detailPayload) // session detail for startParking
        .mockResolvedValueOnce(assignTaskPayload) // assign task to self
        .mockResolvedValueOnce({
          createdAt: "2026-08-21T18:05:45.000Z",
          currentAssigneeMembershipId: "77777777-7777-4777-8777-777777777777",
          sessionId,
          status: "ACCEPTED",
          taskId,
          taskType: "PARKING",
          version: 3,
        }) // accept task
        .mockResolvedValueOnce(startParkingPayload) // start parking
        .mockResolvedValueOnce(confirmParkedPayload), // confirm parked
    } as unknown as EmployeeApiClient;

    const checkInController = new CheckInController(mockClient, vi.fn());
    await checkInController.initialize(locationId);

    expect(checkInController.getState().step).toBe("plate-scan");

    // 1. Confirm plate stores pendingVehicle locally
    await checkInController.confirmPlate({
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    });
    expect(checkInController.getState().step).toBe("customer-phone");
    expect(checkInController.getState().pendingVehicle?.plateNumberRaw).toBe("12-34567");

    // 2. Submit customer phone creates authoritative intake
    await checkInController.submitCustomerPhone(locationId, "+962791234567");
    expect(checkInController.getState().activeSession?.sessionId).toBe(sessionId);
    expect(checkInController.getState().activeSession?.state).toBe("CHECKING_IN");

    // 3. Condition completion transitions to AWAITING_PARKING
    await checkInController.completeCondition("No scratches");
    expect(checkInController.getState().activeSession?.state).toBe("AWAITING_PARKING");

    // 4. Assign key slot
    await checkInController.assignKey("B-214");
    expect(checkInController.getState().activeSession?.keySlotCode).toBe("B-214");

    // 5. Create parking task
    await checkInController.createParkingTask();
    expect(checkInController.getState().activeSession?.parkingTaskId).toBe(taskId);

    // 6. Start parking transitions to ParkingFlow payload
    const parkingPayload = await checkInController.startParking();
    expect(parkingPayload).not.toBeNull();
    expect(parkingPayload?.taskId).toBe(taskId);
    expect(parkingPayload?.sessionVersion).toBe(4);

    // 7. Parking controller confirms parked
    const parkingController = new ParkingController(mockClient, vi.fn());
    parkingController.setActiveSession({
      keySlotCode: parkingPayload!.keySlotCode,
      locationId: parkingPayload!.locationId,
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: parkingPayload!.parkingStartedAt,
      parkingZoneCode: "North-A",
      sessionId: parkingPayload!.sessionId,
      sessionVersion: parkingPayload!.sessionVersion,
      taskId: parkingPayload!.taskId,
      taskVersion: parkingPayload!.taskVersion,
      vehicle: parkingPayload!.vehicle,
    });

    await parkingController.confirmParked("P-101", "B-214");

    const parkingState = parkingController.getState();
    expect(parkingState.step).toBe("success");
    expect(parkingState.activeSession?.parkingSpotCode).toBe("P-101");
    expect(parkingState.activeSession?.sessionVersion).toBe(5);
    expect(parkingState.activeSession?.taskVersion).toBe(5);
  });

  it("handles key conflict without showing false success", async () => {
    const mockClient = {
      request: vi
        .fn()
        .mockResolvedValueOnce({
          checkIn: { conditionCompletedAt: "2026-08-21T18:00:00.000Z" },
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
          state: "AWAITING_PARKING",
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
          version: 2,
        })
        .mockRejectedValueOnce(new Error("Key slot already occupied.")),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn());
    await controller.hydrateFromContinuation(locationId, {
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

    expect(controller.getState().step).toBe("key-scan");

    await controller.assignKey("B-214");

    expect(controller.getState().step).toBe("key-scan");
    expect(controller.getState().error).toBe("Key slot already occupied.");
    expect(controller.getState().activeSession?.keySlotCode).toBeNull();
  });
});
