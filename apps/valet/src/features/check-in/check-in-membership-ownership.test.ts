import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { CheckInController } from "./check-in-controller";
import type { ParkingTaskQueueResponse } from "./check-in-api";

describe("CheckInController Membership Ownership Guards", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "33333333-3333-4333-8333-333333333333";
  const myMembershipId = "77777777-7777-4777-8777-777777777777";
  const otherMembershipId = "88888888-8888-4888-8888-888888888888";

  const activeSession = {
    conditionCompletedAt: "2026-08-21T18:05:00.000Z",
    customerPhone: "+962790000000",
    keySlotCode: "B-214",
    locationId: "22222222-2222-4222-8222-222222222222",
    parkingTaskId: taskId,
    parkingTaskVersion: 2,
    sessionId,
    sessionVersion: 3,
    state: "AWAITING_PARKING" as const,
    vehicle: {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
    vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
  };

  it("denies startParking when parking task is ASSIGNED to another employee", async () => {
    const queuePayload: ParkingTaskQueueResponse = {
      createdAt: "2026-08-21T18:07:00.000Z",
      currentAssigneeMembershipId: otherMembershipId,
      sessionId,
      status: "ASSIGNED",
      taskId,
      taskType: "PARKING",
      version: 2,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(queuePayload),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn(), myMembershipId);
    (controller as unknown as { state: { activeSession: typeof activeSession } }).state.activeSession = activeSession;

    const payload = await controller.startParking();
    expect(payload).toBeNull();
    expect(controller.getState().error).toContain("assigned to another staff member");
    expect(mockClient.request).toHaveBeenCalledTimes(1); // queue call only, no mutation
  });

  it("denies startParking when parking task is ACCEPTED by another employee", async () => {
    const queuePayload: ParkingTaskQueueResponse = {
      createdAt: "2026-08-21T18:07:00.000Z",
      currentAssigneeMembershipId: otherMembershipId,
      sessionId,
      status: "ACCEPTED",
      taskId,
      taskType: "PARKING",
      version: 3,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(queuePayload),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn(), myMembershipId);
    (controller as unknown as { state: { activeSession: typeof activeSession } }).state.activeSession = activeSession;

    const payload = await controller.startParking();
    expect(payload).toBeNull();
    expect(controller.getState().error).toContain("assigned to another staff member");
    expect(mockClient.request).toHaveBeenCalledTimes(1); // no mutation
  });

  it("denies startParking when parking task is IN_PROGRESS by another employee", async () => {
    const queuePayload: ParkingTaskQueueResponse = {
      createdAt: "2026-08-21T18:07:00.000Z",
      currentAssigneeMembershipId: otherMembershipId,
      sessionId,
      status: "IN_PROGRESS",
      taskId,
      taskType: "PARKING",
      version: 4,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(queuePayload),
    } as unknown as EmployeeApiClient;

    const controller = new CheckInController(mockClient, vi.fn(), myMembershipId);
    (controller as unknown as { state: { activeSession: typeof activeSession } }).state.activeSession = activeSession;

    const payload = await controller.startParking();
    expect(payload).toBeNull();
    expect(controller.getState().error).toContain("assigned to another staff member");
    expect(mockClient.request).toHaveBeenCalledTimes(1); // no mutation
  });
});
