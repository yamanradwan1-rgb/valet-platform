import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { HandoffController } from "./handoff-controller";

const sessionId = "11111111-1111-4111-8111-111111111111";
const locationId = "33333333-3333-4333-8333-333333333333";

function detail(state: string, version: number, verification: unknown = null) {
  return {
    checkIn: { conditionCompletedAt: "2026-08-22T09:00:00.000Z" },
    handoff:
      state === "HANDOFF_PENDING"
        ? { pendingAt: "2026-08-22T10:00:00.000Z", verification }
        : { pendingAt: null, verification: null },
    guestAccess: { expiresAt: null, revokedAt: null, status: "NOT_ISSUED" },
    keySlot: null,
    locationId,
    parking: {
      parkedAt: "2026-08-22T09:05:00.000Z",
      parkingSpotCode: null,
      parkingStartedAt: "2026-08-22T09:02:00.000Z",
      parkingZoneCode: null,
    },
    sessionId,
    state,
    vehicle: {
      color: "Black",
      make: "Audi",
      model: "A6",
      plateCountry: "JO",
      plateNumberRaw: "77-99999",
      temporaryDescriptor: null,
      vehicleId: "44444444-4444-4444-8444-444444444444",
      vehicleUpdatedAt: "2026-08-22T09:00:00.000Z",
    },
    version,
  };
}
const readyDetail = (version: number) => detail("READY", version);
const pendingDetail = (
  version: number,
  verification: unknown = null,
) => detail("HANDOFF_PENDING", version, verification);
const verifiedDetail = (version: number) =>
  pendingDetail(version, {
    method: "PICKUP_CODE",
    status: "VERIFIED",
    verifiedAt: "2026-08-22T10:01:00.000Z",
  });
const completedDetail = (version: number) => detail("COMPLETED", version);

const initiateOk = {
  handoffPendingAt: "2026-08-22T10:00:00.000Z",
  sessionId,
  sessionVersion: 8,
  state: "HANDOFF_PENDING",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskStatus: "IN_PROGRESS",
  taskVersion: 5,
};
const verifiedOk = {
  method: "PICKUP_CODE",
  sessionId,
  sessionVersion: 9,
  state: "HANDOFF_PENDING",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskStatus: "IN_PROGRESS",
  taskVersion: 5,
  verificationStatus: "VERIFIED",
  verifiedAt: "2026-08-22T10:01:00.000Z",
};
const completedOk = {
  retrievalRequestStatus: "COMPLETED",
  sessionId,
  sessionVersion: 10,
  state: "COMPLETED",
  taskId: "22222222-2222-4222-8222-222222222222",
  taskStatus: "COMPLETED",
  taskVersion: 6,
};

function setup(responses: Array<unknown | Error>) {
  const request = vi.fn();
  responses.forEach((r) =>
    request.mockImplementationOnce(() =>
      r instanceof Error ? Promise.reject(r) : Promise.resolve(r),
    ),
  );
  const onComplete = vi.fn();
  const controller = new HandoffController({
    apiClient: { request } as unknown as EmployeeApiClient,
    onComplete,
    onStateChange: () => undefined,
  });
  return { controller, onComplete, request };
}

describe("HandoffController lifecycle guards", () => {
  it("initiate transport loss rehydrates A1 and adopts authoritative READY", async () => {
    const { controller, request } = setup([
      new Error("Network connection lost."),
      readyDetail(7),
    ]);
    await controller.initiate(sessionId, 7);
    const state = controller.getState();
    expect(state.phase).toBe("idle");
    expect(state.sessionVersion).toBe(7);
    // Adoption clears the stale failure once A1 proves READY.
    expect(state.error).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("recovers initiate response loss into HANDOFF_PENDING from A1", async () => {
    const { controller } = setup([
      new EmployeeApiError({ code: "NETWORK_ERROR", message: "offline", status: 0 }),
      pendingDetail(8),
    ]);
    await controller.initiate(sessionId, 7);
    const state = controller.getState();
    expect(state.phase).toBe("pending-unverified");
    expect(state.sessionVersion).toBe(8);
    expect(state.error).toBeNull();
  });

  it("recovers verify response loss into VERIFIED without re-entry", async () => {
    const { controller } = setup([
      initiateOk,
      new EmployeeApiError({ code: "NETWORK_ERROR", message: "offline", status: 0 }),
      verifiedDetail(9),
    ]);
    await controller.initiate(sessionId, 7);
    await controller.verifyPickupCode(sessionId, "0482");
    const state = controller.getState();
    expect(state.phase).toBe("verified");
    expect(state.verification).toEqual({
      method: "PICKUP_CODE",
      status: "VERIFIED",
      verifiedAt: "2026-08-22T10:01:00.000Z",
    });
    expect(state.sessionVersion).toBe(9);
  });

  it("recovers complete response loss into COMPLETED without offering release again", async () => {
    const { controller, onComplete } = setup([
      initiateOk,
      verifiedOk,
      new EmployeeApiError({ code: "VERSION_CONFLICT", message: "stale", status: 409 }),
      completedDetail(10),
    ]);
    await controller.initiate(sessionId, 7);
    await controller.verifyPickupCode(sessionId, "0482");
    await controller.complete(sessionId);
    expect(controller.getState().phase).toBe("completed");
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Release cannot be attempted again from a completed phase.
    await controller.complete(sessionId);
    expect(controller.getState().phase).toBe("completed");
  });

  it("recovers abort response loss back to READY from A1", async () => {
    const { controller } = setup([
      initiateOk,
      new EmployeeApiError({ code: "STAFF_SESSION_SERVICE_UNAVAILABLE", message: "down", status: 503 }),
      readyDetail(10),
    ]);
    await controller.initiate(sessionId, 7);
    await controller.abort(sessionId, "Guest left");
    const state = controller.getState();
    expect(state.phase).toBe("idle");
    expect(state.sessionVersion).toBe(10);
    expect(state.verification).toBeNull();
  });

  it("does NOT attempt A1 recovery for authoritative business errors", async () => {
    const { controller, request } = setup([
      initiateOk,
      new EmployeeApiError({
        code: "HANDOFF_VERIFICATION_FAILED",
        message: "failed",
        status: 409,
      }),
    ]);
    await controller.initiate(sessionId, 7);
    await controller.verifyPickupCode(sessionId, "0482");
    expect(controller.getState().phase).toBe("pending-unverified");
    // Only the verification mutation ran; no A1 probe for business errors.
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("double initiate issues exactly one request; success adopts pending + version", async () => {
    const { controller, request } = setup([initiateOk]);
    const first = controller.initiate(sessionId, 7);
    const second = await controller.initiate(sessionId, 7);
    await first;
    expect(second).toBe(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.getState().phase).toBe("pending-unverified");
    expect(controller.getState().sessionVersion).toBe(8);
  });

  it("verification failure keeps pending-unverified without local success", async () => {
    const { controller } = setup([
      initiateOk,
      new EmployeeApiError({
        code: "HANDOFF_VERIFICATION_FAILED",
        message: "failed",
        status: 409,
      }),
    ]);
    await controller.initiate(sessionId, 7);
    await controller.verifyPickupCode(sessionId, "0482");
    const state = controller.getState();
    expect(state.phase).toBe("pending-unverified");
    expect(state.errorMeta.code).toBe("HANDOFF_VERIFICATION_FAILED");
  });

  it("rate limit surfaces retry guidance without advancing", async () => {
    const { controller } = setup([
      initiateOk,
      new EmployeeApiError({
        code: "HANDOFF_VERIFICATION_RATE_LIMITED",
        message: "limited",
        retryAfter: 30,
        status: 429,
      }),
    ]);
    await controller.initiate(sessionId, 7);
    await controller.verifyPickupCode(sessionId, "0482");
    const state = controller.getState();
    expect(state.phase).toBe("pending-unverified");
    expect(state.errorMeta.retryAfterSeconds).toBe(30);
    expect(state.error).toContain("30s");
  });

  it("verification success adopts VERIFIED and complete adopts COMPLETED once", async () => {
    const { controller, onComplete, request } = setup([
      initiateOk,
      verifiedOk,
      completedOk,
      new Error("should not be called"),
    ]);
    await controller.initiate(sessionId, 7);
    await controller.verifyPickupCode(sessionId, "0482");
    expect(controller.getState().phase).toBe("verified");

    await controller.complete(sessionId);
    expect(controller.getState().phase).toBe("completed");
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Double complete is guarded.
    await controller.complete(sessionId);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("financial release block keeps VERIFIED HANDOFF_PENDING with truthful error", async () => {
    const { controller } = setup([
      initiateOk,
      verifiedOk,
      new EmployeeApiError({
        code: "FINANCIAL_RELEASE_NOT_SATISFIED",
        message: "blocked",
        status: 409,
      }),
    ]);
    await controller.initiate(sessionId, 7);
    await controller.verifyPickupCode(sessionId, "0482");
    await controller.complete(sessionId);
    const state = controller.getState();
    expect(state.phase).toBe("verified");
    expect(state.errorMeta.code).toBe("FINANCIAL_RELEASE_NOT_SATISFIED");
  });

  it("abort returns idle with authoritative READY version", async () => {
    const { controller } = setup([
      initiateOk,
      {
        sessionId,
        sessionVersion: 10,
        state: "READY",
        taskId: "22222222-2222-4222-8222-222222222222",
        taskStatus: "IN_PROGRESS",
        taskVersion: 5,
      },
    ]);
    await controller.initiate(sessionId, 7);
    await controller.abort(sessionId, "Guest left");
    const state = controller.getState();
    expect(state.phase).toBe("idle");
    expect(state.sessionVersion).toBe(10);
    expect(state.verification).toBeNull();
  });
});
