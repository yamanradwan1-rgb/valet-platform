import { describe, expect, it, vi } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { ParkingController } from "./parking-controller";
import type { ActiveParkingSession } from "./parking-types";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const TASK_A = "33333333-3333-4333-8333-333333333333";
const TASK_B = "44444444-4444-4444-8444-444444444444";
const LOCATION = "55555555-5555-4555-8555-555555555555";
const DATE = "2026-10-30T08:00:00.000Z";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function active(
  id: string,
  task: string,
  version: number,
): ActiveParkingSession {
  return {
    keySlotCode: null,
    locationId: LOCATION,
    parkedAt: null,
    parkingSpotCode: null,
    parkingStartedAt: DATE,
    parkingZoneCode: "North",
    sessionId: id,
    sessionVersion: version,
    taskId: task,
    taskVersion: version,
    vehicle: {
      color: "Silver",
      make: "Toyota",
      model: "Corolla",
      plateCountry: "JO",
      plateNumberRaw: id === SESSION_A ? "A-PLATE" : "B-PLATE",
      temporaryDescriptor: null,
    },
  };
}

function detail(id: string, version: number): StaffValetSessionDetailResponse {
  return {
    checkIn: { conditionCompletedAt: DATE },
    handoff: { pendingAt: null, verification: null },
    guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
    keySlot: null,
    locationId: LOCATION,
    parking: {
      parkedAt: null,
      parkingSpotCode: null,
      parkingStartedAt: DATE,
      parkingZoneCode: "North",
    },
    sessionId: id,
    state: "PARKING",
    vehicle: {
      ...active(id, TASK_A, version).vehicle,
      vehicleId: "66666666-6666-4666-8666-666666666666",
      vehicleUpdatedAt: DATE,
    },
    version,
  };
}

function controllerFor(request: ReturnType<typeof vi.fn>) {
  const client = { request } as unknown as EmployeeApiClient;
  return new ParkingController(client, vi.fn());
}

describe("ParkingController stale async results", () => {
  it.each(["success", "failure"] as const)(
    "discards late A hydration %s after B selection",
    async (outcome) => {
      const pending = deferred<StaffValetSessionDetailResponse>();
      const controller = controllerFor(vi.fn(() => pending.promise));
      const a = controller.hydrateSession(SESSION_A, TASK_A, 9);
      controller.setActiveSession(active(SESSION_B, TASK_B, 4));
      if (outcome === "success") pending.resolve(detail(SESSION_A, 6));
      else pending.reject(new Error("Late A failure"));
      await a;

      const state = controller.getState();
      expect(state.activeSession).toEqual(active(SESSION_B, TASK_B, 4));
      expect(state.error).toBeNull();
      expect(state.errorCode).toBeNull();
      expect(state.isHydrating).toBe(false);
    },
  );

  it("cannot confirm the previous target while the replacement is hydrating or after its failure", async () => {
    const pending = deferred<StaffValetSessionDetailResponse>();
    const request = vi.fn(() => pending.promise);
    const controller = controllerFor(request);
    controller.setActiveSession(active(SESSION_B, TASK_B, 4));
    const a = controller.hydrateSession(SESSION_A, TASK_A, 9);

    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().isHydrating).toBe(true);
    await controller.confirmParked("SPOT-B", "KEY-B");
    expect(request).toHaveBeenCalledTimes(1);

    pending.reject(new Error("A detail unavailable"));
    await a;
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toBe("A detail unavailable");
    await controller.confirmParked("SPOT-B", "KEY-B");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps the latest of two hydration attempts for the same target", async () => {
    const first = deferred<StaffValetSessionDetailResponse>();
    const second = deferred<StaffValetSessionDetailResponse>();
    const request = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const controller = controllerFor(request);
    const a1 = controller.hydrateSession(SESSION_A, TASK_A, 9);
    const a2 = controller.hydrateSession(SESSION_A, TASK_A, 10);
    second.resolve(detail(SESSION_A, 8));
    await a2;
    first.resolve(detail(SESSION_A, 6));
    await a1;
    expect(controller.getState().activeSession?.taskVersion).toBe(10);
    expect(controller.getState().activeSession?.sessionVersion).toBe(8);
  });

  it("advances same-target CAS versions without resetting the current form step", () => {
    const controller = controllerFor(vi.fn());
    controller.setActiveSession(active(SESSION_B, TASK_B, 4));
    controller.setStep("key-return");
    controller.setActiveSession(active(SESSION_B, TASK_B, 6));
    controller.setActiveSession(active(SESSION_B, TASK_B, 3));

    expect(controller.getState().step).toBe("key-return");
    expect(controller.getState().activeSession?.sessionVersion).toBe(6);
    expect(controller.getState().activeSession?.taskVersion).toBe(6);
  });

  it("does not publish an old confirm result after selection changes", async () => {
    const pending = deferred<unknown>();
    const request = vi.fn(() => pending.promise);
    const controller = controllerFor(request);
    controller.setActiveSession(active(SESSION_A, TASK_A, 9));
    const confirmation = controller.confirmParked("SPOT-A", "KEY-A");
    controller.setActiveSession(active(SESSION_B, TASK_B, 4));
    pending.reject(new Error("Late confirmation error"));
    await confirmation;
    expect(controller.getState().activeSession?.sessionId).toBe(SESSION_B);
    expect(controller.getState().error).toBeNull();
    expect(controller.getState().isSubmitting).toBe(false);
  });

  it("preserves an in-flight confirmation on an equivalent rerender", async () => {
    const pending = deferred<unknown>();
    const request = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(detail(SESSION_A, 11));
    const controller = controllerFor(request);
    controller.setActiveSession(active(SESSION_A, TASK_A, 9));
    const confirmation = controller.confirmParked("SPOT-A", "KEY-A");
    controller.setActiveSession(active(SESSION_A, TASK_A, 9));
    pending.resolve({
      parkedAt: DATE,
      parkingSpotCode: "SPOT-A",
      parkingSpotId: "77777777-7777-4777-8777-777777777777",
      parkingZoneId: "88888888-8888-4888-8888-888888888888",
      sessionId: SESSION_A,
      sessionVersion: 10,
      state: "PARKED",
      taskId: TASK_A,
      taskStatus: "COMPLETED",
      taskVersion: 10,
    });
    await confirmation;
    expect(controller.getState().step).toBe("success");
    expect(controller.getState().activeSession?.sessionVersion).toBe(10);
  });

  it("never regresses CAS versions when newer same-target props arrive during confirm", async () => {
    const pending = deferred<unknown>();
    const request = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(detail(SESSION_A, 11));
    const controller = controllerFor(request);
    controller.setActiveSession(active(SESSION_A, TASK_A, 9));
    const confirmation = controller.confirmParked("SPOT-A", "KEY-A");
    controller.setActiveSession(active(SESSION_A, TASK_A, 12));
    expect(controller.getState().isSubmitting).toBe(true);
    pending.resolve({
      parkedAt: DATE,
      parkingSpotCode: "SPOT-A",
      parkingSpotId: "77777777-7777-4777-8777-777777777777",
      parkingZoneId: "88888888-8888-4888-8888-888888888888",
      sessionId: SESSION_A,
      sessionVersion: 10,
      state: "PARKED",
      taskId: TASK_A,
      taskStatus: "COMPLETED",
      taskVersion: 10,
    });
    await confirmation;

    expect(controller.getState().step).toBe("success");
    expect(controller.getState().activeSession?.sessionVersion).toBe(12);
    expect(controller.getState().activeSession?.taskVersion).toBe(12);
    expect(controller.getState().isSubmitting).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("ignores a hydration result after unmount and subsequent activation", async () => {
    const pending = deferred<StaffValetSessionDetailResponse>();
    const controller = controllerFor(vi.fn(() => pending.promise));
    const a = controller.hydrateSession(SESSION_A, TASK_A, 9);
    controller.deactivate();
    controller.activate(); // React Strict Mode re-mount of the same controller.
    controller.setActiveSession(active(SESSION_B, TASK_B, 4));
    pending.resolve(detail(SESSION_A, 6));
    await a;
    expect(controller.getState().activeSession?.sessionId).toBe(SESSION_B);
  });
});
