import { describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "../../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../../lib/api/employee-api-client";
import { HandoffController } from "./handoff-controller";

const sessionId = "11111111-1111-4111-8111-111111111111";
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
  it("initiate failure leaves READY version truthfully and does not fabricate pending", async () => {
    const { controller, request } = setup([
      new Error("Network connection lost."),
    ]);
    const first = await controller.initiate(sessionId, 7);
    expect(first).toBe(true);
    const state = controller.getState();
    expect(state.phase).toBe("idle");
    expect(state.sessionVersion).toBe(7);
    expect(state.error).toContain("Network");
    expect(request).toHaveBeenCalledTimes(1);
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
