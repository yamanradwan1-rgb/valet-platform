import { describe, expect, it, vi } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { RetrievalController } from "./retrieval-controller";

describe("RetrievalController Hydration — Strict Metadata Requirements", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const taskId = "22222222-2222-4222-8222-222222222222";
  const locationId = "33333333-3333-4333-8333-333333333333";
  const vehicleId = "44444444-4444-4444-8444-444444444444";
  const myMembershipId = "55555555-5555-4555-8555-555555555555";
  const otherMembershipId = "66666666-6666-4666-8666-666666666666";

  const baseDetail: StaffValetSessionDetailResponse = {
    checkIn: { conditionCompletedAt: "2026-08-21T18:00:00.000Z" },
    handoff: { pendingAt: null, verification: null },
    guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
    keySlot: { code: "B-214" },
    locationId,
    parking: {
      parkedAt: "2026-08-21T18:05:00.000Z",
      parkingSpotCode: "P-101",
      parkingStartedAt: "2026-08-21T18:02:00.000Z",
      parkingZoneCode: "Zone A",
    },
    sessionId,
    state: "REQUESTED",
    vehicle: {
      color: "Black",
      make: "Porsche",
      model: "Taycan",
      plateCountry: "JO",
      plateNumberRaw: "12-34567",
      temporaryDescriptor: null,
      vehicleId,
      vehicleUpdatedAt: "2026-08-21T18:00:00.000Z",
    },
    version: 4,
  };

  it("fails closed when membershipId is missing", async () => {
    const mockClient = { request: vi.fn() } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), null);
    await controller.hydrateSession(sessionId, taskId, 2, "ACCEPTED", myMembershipId);
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("No active staff membership");
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("fails closed when assigneeMembershipId is missing", async () => {
    const mockClient = { request: vi.fn() } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(
      sessionId, taskId, 2, "ACCEPTED", null as unknown as string,
    );
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("assignee metadata is missing");
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("fails closed when taskStatus is missing", async () => {
    const mockClient = { request: vi.fn() } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(
      sessionId, taskId, 2, null as unknown as "ACCEPTED" | "IN_PROGRESS", myMembershipId,
    );
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("status metadata is missing");
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("fails closed when assigneeMembershipId does not match membershipId", async () => {
    const mockClient = { request: vi.fn() } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(sessionId, taskId, 2, "ACCEPTED", otherMembershipId);
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("assigned to another valet employee");
    expect(mockClient.request).not.toHaveBeenCalled();
  });

  it("fails closed when taskStatus is incompatible with REQUESTED (IN_PROGRESS given)", async () => {
    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(baseDetail),
    } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(sessionId, taskId, 2, "IN_PROGRESS", myMembershipId);
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("incompatible");
  });

  it("REQUESTED + ACCEPTED + owned -> succeeds", async () => {
    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(baseDetail),
    } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(sessionId, taskId, 2, "ACCEPTED", myMembershipId);
    const state = controller.getState();
    expect(state.step).toBe("key-checkout");
    expect(state.activeSession?.sessionId).toBe(sessionId);
    expect(state.activeSession?.state).toBe("REQUESTED");
    expect(state.activeSession?.taskStatus).toBe("ACCEPTED");
    expect(state.activeSession?.parkingSpotCode).toBe("P-101");
  });

  it("RETRIEVING + IN_PROGRESS + owned -> succeeds with null spot", async () => {
    const retrievingDetail: StaffValetSessionDetailResponse = {
      ...baseDetail,
      parking: { ...baseDetail.parking, parkingSpotCode: null, parkingZoneCode: null },
      state: "RETRIEVING",
      version: 5,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(retrievingDetail),
    } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(sessionId, taskId, 3, "IN_PROGRESS", myMembershipId);
    const state = controller.getState();
    expect(state.step).toBe("in-progress");
    expect(state.activeSession?.state).toBe("RETRIEVING");
    expect(state.activeSession?.taskStatus).toBe("IN_PROGRESS");
    expect(state.activeSession?.parkingSpotCode).toBeNull();
  });

  it("fails closed when RETRIEVING session is paired with stale ACCEPTED status", async () => {
    const retrievingDetail: StaffValetSessionDetailResponse = {
      ...baseDetail,
      parking: { ...baseDetail.parking, parkingSpotCode: null, parkingZoneCode: null },
      state: "RETRIEVING",
      version: 5,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(retrievingDetail),
    } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(sessionId, taskId, 3, "ACCEPTED", myMembershipId);
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("incompatible");
  });

  it("READY + IN_PROGRESS + owned -> succeeds with null spot", async () => {
    const readyDetail: StaffValetSessionDetailResponse = {
      ...baseDetail,
      parking: { ...baseDetail.parking, parkingSpotCode: null, parkingZoneCode: null },
      state: "READY",
      version: 6,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(readyDetail),
    } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(sessionId, taskId, 3, "IN_PROGRESS", myMembershipId);
    const state = controller.getState();
    expect(state.step).toBe("vehicle-ready");
    expect(state.activeSession?.state).toBe("READY");
    expect(state.activeSession?.taskStatus).toBe("IN_PROGRESS");
    expect(state.activeSession?.parkingSpotCode).toBeNull();
  });

  it("fails closed when READY task ownership is wrong", async () => {
    const readyDetail: StaffValetSessionDetailResponse = {
      ...baseDetail,
      parking: { ...baseDetail.parking, parkingSpotCode: null, parkingZoneCode: null },
      state: "READY",
      version: 6,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(readyDetail),
    } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(sessionId, taskId, 3, "IN_PROGRESS", otherMembershipId);
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("assigned to another valet employee");
  });

  it("fails closed when session state is incompatible (PARKED)", async () => {
    const parkedDetail: StaffValetSessionDetailResponse = {
      ...baseDetail, state: "PARKED", version: 3,
    };
    const mockClient = {
      request: vi.fn().mockResolvedValueOnce(parkedDetail),
    } as unknown as EmployeeApiClient;
    const controller = new RetrievalController(mockClient, vi.fn(), myMembershipId);
    await controller.hydrateSession(sessionId, taskId, 1, "ACCEPTED", myMembershipId);
    expect(controller.getState().activeSession).toBeNull();
    expect(controller.getState().error).toContain("cannot be retrieved");
  });
});
