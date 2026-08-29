import { describe, expect, it, vi } from "vitest";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { ParkingController } from "./parking-controller";
import type { ActiveParkingSession } from "./parking-types";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const TASK_A = "33333333-3333-4333-8333-333333333333";
const TASK_B = "44444444-4444-4444-8444-444444444444";

function activeSession(
  sessionId = SESSION_A,
  taskId = TASK_A,
): ActiveParkingSession {
  return {
    keySlotCode: null,
    locationId: "55555555-5555-4555-8555-555555555555",
    parkedAt: null,
    parkingSpotCode: null,
    parkingStartedAt: "2026-08-29T18:05:00.000Z",
    parkingZoneCode: null,
    sessionId,
    sessionVersion: 3,
    taskId,
    taskVersion: 4,
    vehicle: {
      color: "Black",
      make: "BMW",
      model: "X5",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
  };
}

function createController() {
  const client = {
    request: vi.fn(),
  } as unknown as EmployeeApiClient;
  return { client, controller: new ParkingController(client, vi.fn()) };
}

describe("ParkingController shell-rerender initialization", () => {
  it("initializes a new parking workflow at in-progress", () => {
    const { controller } = createController();
    controller.setActiveSession(activeSession());
    expect(controller.getState().step).toBe("in-progress");
  });

  it.each(["spot-scan", "key-return", "success"] as const)(
    "preserves %s when polling reconstructs the same workflow",
    (step) => {
      const { controller } = createController();
      const session = activeSession();
      controller.setActiveSession(session);
      controller.setStep(step);

      controller.setActiveSession({
        ...session,
        vehicle: { ...session.vehicle },
      });

      expect(controller.getState().step).toBe(step);
      expect(controller.getState().activeSession).toBe(session);
    },
  );

  it.each([
    [SESSION_B, TASK_A],
    [SESSION_A, TASK_B],
  ])(
    "resets for a genuinely different session/task identity",
    (sessionId, taskId) => {
      const { controller } = createController();
      controller.setActiveSession(activeSession());
      controller.setStep("key-return");

      controller.setActiveSession(activeSession(sessionId, taskId));

      expect(controller.getState().step).toBe("in-progress");
      expect(controller.getState().activeSession?.sessionId).toBe(sessionId);
      expect(controller.getState().activeSession?.taskId).toBe(taskId);
    },
  );

  it("does not introduce hydration or mutation calls for equivalent rerenders", () => {
    const { client, controller } = createController();
    const session = activeSession();
    controller.setActiveSession(session);
    controller.setStep("spot-scan");
    controller.setActiveSession({ ...session });
    controller.setActiveSession({ ...session });

    expect(client.request).not.toHaveBeenCalled();
    expect(controller.getState().step).toBe("spot-scan");
  });
});
