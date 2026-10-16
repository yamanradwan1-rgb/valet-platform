import { describe, expect, it, vi } from "vitest";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { RetrievalController } from "./retrieval-controller";
import type {
  MarkReadyResponse,
  StartRetrievalResponse,
} from "./retrieval-api";
import type { ActiveRetrievalSession } from "./retrieval-types";

describe("Retrieval Mutations & Double-Submit Protection", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const locationId = "33333333-3333-4333-8333-333333333333";

  const activeRequestedSession: ActiveRetrievalSession = {
    handoff: { pendingAt: null, verification: null },
expectedKeySlotCode: "B-214",
    isKeyConfirmed: false,
    locationId,
    parkingSpotCode: "P-101",
    parkingZoneCode: "Zone A",
    readyAt: null,
    retrievalStartedAt: null,
    sessionId,
    sessionVersion: 4,
    state: "REQUESTED",
    taskId,
    taskStatus: "ACCEPTED",
    taskVersion: 2,
    vehicle: {
      color: "Black",
      make: "Porsche",
      model: "Taycan",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
    },
  };

  it("verifies matching key slot code and rejects wrong key", () => {
    const mockClient = { request: vi.fn() } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn());
    controller.setActiveSession(activeRequestedSession);

    // Wrong key
    const wrongResult = controller.confirmKey("C-109");
    expect(wrongResult).toBe(false);
    expect(controller.getState().activeSession?.isKeyConfirmed).toBe(false);
    expect(controller.getState().error).toContain("does not match");

    // Custody verification requires exact case-sensitive code matching.
    expect(controller.confirmKey("b-214")).toBe(false);
    expect(controller.getState().activeSession?.isKeyConfirmed).toBe(false);

    // Correct key
    const matchResult = controller.confirmKey("B-214");
    expect(matchResult).toBe(true);
    expect(controller.getState().activeSession?.isKeyConfirmed).toBe(true);
    expect(controller.getState().error).toBeNull();
  });

  it("executes startRetrieval, clears released parking spot, and updates versions", async () => {
    const startRes: StartRetrievalResponse = {
      retrievalStartedAt: "2026-08-21T18:10:00.000Z",
      sessionId,
      sessionVersion: 5,
      state: "RETRIEVING",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 3,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(startRes),
    } as unknown as EmployeeApiClient;

    const controller = new RetrievalController(mockClient, vi.fn());
    controller.setActiveSession({
      ...activeRequestedSession,
      isKeyConfirmed: true,
    });

    await controller.startRetrieval();

    expect(mockClient.request).toHaveBeenCalledTimes(1);
    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/valet-sessions/${sessionId}/start-retrieval`,
      expect.objectContaining({
        body: { expectedSessionVersion: 4, expectedTaskVersion: 2 },
        method: "POST",
      }),
    );

    const state = controller.getState();
    expect(state.step).toBe("in-progress");
    expect(state.activeSession?.state).toBe("RETRIEVING");
    expect(state.activeSession?.sessionVersion).toBe(5);
    expect(state.activeSession?.taskVersion).toBe(3);
    expect(state.activeSession?.taskStatus).toBe("IN_PROGRESS");
    expect(state.activeSession?.parkingSpotCode).toBeNull(); // Released
    expect(state.activeSession?.parkingZoneCode).toBeNull(); // Released
    expect(state.activeSession?.retrievalStartedAt).toBe(
      "2026-08-21T18:10:00.000Z",
    );
  });

  it("prevents startRetrieval when key is not confirmed", async () => {
    const mockClient = { request: vi.fn() } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn());
    controller.setActiveSession(activeRequestedSession);

    await controller.startRetrieval();

    expect(mockClient.request).not.toHaveBeenCalled();
    expect(controller.getState().error).toContain("Key slot must be verified");
    expect(controller.getState().step).toBe("key-checkout");
  });

  it("handles startRetrieval failure without advancing UI", async () => {
    const mockClient = {
      request: vi.fn().mockRejectedValue(new Error("Task version mismatch.")),
    } as unknown as EmployeeApiClient;

    const controller = new RetrievalController(mockClient, vi.fn());
    controller.setActiveSession({
      ...activeRequestedSession,
      isKeyConfirmed: true,
    });

    await controller.startRetrieval();

    expect(controller.getState().step).toBe("key-checkout");
    expect(controller.getState().error).toBe("Task version mismatch.");
    expect(controller.getState().activeSession?.state).toBe("REQUESTED");
  });

  it("guards startRetrieval against double-submit on rapid invocations", async () => {
    let resolvePromise!: (val: StartRetrievalResponse) => void;
    const pendingPromise = new Promise<StartRetrievalResponse>((res) => {
      resolvePromise = res;
    });

    const mockClient = {
      request: vi.fn().mockReturnValue(pendingPromise),
    } as unknown as EmployeeApiClient;

    const controller = new RetrievalController(mockClient, vi.fn());
    controller.setActiveSession({
      ...activeRequestedSession,
      isKeyConfirmed: true,
    });

    // Rapid double invocation
    const p1 = controller.startRetrieval();
    const p2 = controller.startRetrieval();

    expect(mockClient.request).toHaveBeenCalledTimes(1);

    resolvePromise({
      retrievalStartedAt: "2026-08-21T18:10:00.000Z",
      sessionId,
      sessionVersion: 5,
      state: "RETRIEVING",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 3,
    });

    await Promise.all([p1, p2]);
    expect(mockClient.request).toHaveBeenCalledTimes(1);
  });

  it("executes markReady with exact expectedSessionVersion and preserves task IN_PROGRESS", async () => {
    const markRes: MarkReadyResponse = {
      readyAt: "2026-08-21T18:12:00.000Z",
      sessionId,
      sessionVersion: 6,
      state: "READY",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 3,
    };

    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(markRes),
    } as unknown as EmployeeApiClient;

    const controller = new RetrievalController(mockClient, vi.fn());
    controller.setActiveSession({
      ...activeRequestedSession,
      isKeyConfirmed: true,
      parkingSpotCode: null,
      parkingZoneCode: null,
      retrievalStartedAt: "2026-08-21T18:10:00.000Z",
      sessionVersion: 5,
      state: "RETRIEVING",
      taskStatus: "IN_PROGRESS",
      taskVersion: 3,
    });

    await controller.markReady();

    expect(mockClient.request).toHaveBeenCalledTimes(1);
    expect(mockClient.request).toHaveBeenCalledWith(
      `/v1/staff/valet-sessions/${sessionId}/mark-ready`,
      expect.objectContaining({
        body: { expectedSessionVersion: 5 },
        method: "POST",
      }),
    );

    const state = controller.getState();
    expect(state.step).toBe("vehicle-ready");
    expect(state.activeSession?.state).toBe("READY");
    expect(state.activeSession?.taskStatus).toBe("IN_PROGRESS");
    expect(state.activeSession?.sessionVersion).toBe(6);
    expect(state.activeSession?.readyAt).toBe("2026-08-21T18:12:00.000Z");
    expect(state.activeSession?.parkingSpotCode).toBeNull();
  });

  it("handles markReady failure without advancing to vehicle-ready", async () => {
    const mockClient = {
      request: vi.fn().mockRejectedValue(new Error("Invalid session state.")),
    } as unknown as EmployeeApiClient;

    const controller = new RetrievalController(mockClient, vi.fn());
    controller.setActiveSession({
      ...activeRequestedSession,
      sessionVersion: 5,
      state: "RETRIEVING",
      taskStatus: "IN_PROGRESS",
    });

    await controller.markReady();

    expect(controller.getState().step).toBe("in-progress");
    expect(controller.getState().error).toBe("Invalid session state.");
    expect(controller.getState().activeSession?.state).toBe("RETRIEVING");
  });

  it("guards markReady against double-submit on rapid invocations", async () => {
    let resolvePromise!: (val: MarkReadyResponse) => void;
    const pendingPromise = new Promise<MarkReadyResponse>((res) => {
      resolvePromise = res;
    });

    const mockClient = {
      request: vi.fn().mockReturnValue(pendingPromise),
    } as unknown as EmployeeApiClient;

    const controller = new RetrievalController(mockClient, vi.fn());
    controller.setActiveSession({
      ...activeRequestedSession,
      sessionVersion: 5,
      state: "RETRIEVING",
      taskStatus: "IN_PROGRESS",
    });

    const p1 = controller.markReady();
    const p2 = controller.markReady();

    expect(mockClient.request).toHaveBeenCalledTimes(1);

    resolvePromise({
      readyAt: "2026-08-21T18:12:00.000Z",
      sessionId,
      sessionVersion: 6,
      state: "READY",
      taskId,
      taskStatus: "IN_PROGRESS",
      taskVersion: 3,
    });

    await Promise.all([p1, p2]);
    expect(mockClient.request).toHaveBeenCalledTimes(1);
  });
});
