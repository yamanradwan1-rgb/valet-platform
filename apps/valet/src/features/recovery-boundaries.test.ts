import { describe, expect, it, vi } from "vitest";
import { EmployeeApiError } from "../lib/api/employee-api-errors";
import type { EmployeeApiClient } from "../lib/api/employee-api-client";
import { IncidentController } from "./incidents/incident-controller";
import { HandoffController } from "./handoff/handoff-controller";

/**
 * DEC-058 §8: when the active Shift ends or server state changes while a
 * screen is open, the next protected command must fail closed using the
 * existing command contract — never fabricate local success.
 */
describe("recovery boundaries: shift-end / stale-state fail-closed", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  it("incident submit with TENANT_ACCESS_DENIED does not enter reported phase", async () => {
    const denial = Object.assign(new Error("Denied."), {
      code: "TENANT_ACCESS_DENIED",
      status: 404,
    });
    const request = vi.fn().mockRejectedValue(denial);
    const controller = new IncidentController(
      { request } as unknown as EmployeeApiClient,
      () => undefined,
    );

    await controller.submit({
      description: "Test",
      sessionId,
      severity: "LOW",
      type: "OTHER",
    });

    expect(controller.getState().phase).toBe("idle");
    expect(controller.getState().report).toBeNull();
    expect(controller.getState().error).toContain("Denied");
  });

  it("handoff complete with FINANCIAL_RELEASE_NOT_SATISFIED stays verified", async () => {
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
      method: "PICKUP_CODE" as const,
      sessionId,
      sessionVersion: 9,
      state: "HANDOFF_PENDING",
      taskId: "22222222-2222-4222-8222-222222222222",
      taskStatus: "IN_PROGRESS" as const,
      taskVersion: 5,
      verificationStatus: "VERIFIED" as const,
      verifiedAt: "2026-08-22T10:01:00.000Z",
    };
    const financialBlock = new EmployeeApiError({
      code: "FINANCIAL_RELEASE_NOT_SATISFIED",
      message: "blocked",
      status: 409,
    });
    const request = vi.fn();
    request.mockResolvedValueOnce(initiateOk);
    request.mockResolvedValueOnce(verifiedOk);
    request.mockRejectedValueOnce(financialBlock);
    const controller = new HandoffController({
      apiClient: { request } as unknown as EmployeeApiClient,
      onStateChange: () => undefined,
    });

    await controller.initiate(sessionId, 7);
    await controller.verifyPickupCode(sessionId, "0482");
    await controller.complete(sessionId);

    expect(controller.getState().phase).toBe("verified");
    expect(controller.getState().errorMeta.code).toBe(
      "FINANCIAL_RELEASE_NOT_SATISFIED",
    );
  });

  it("handoff verify with VERSION_CONFLICT rehydrates to authoritative state", async () => {
    const initiateOk = {
      handoffPendingAt: "2026-08-22T10:00:00.000Z",
      sessionId,
      sessionVersion: 8,
      state: "HANDOFF_PENDING",
      taskId: "22222222-2222-4222-8222-222222222222",
      taskStatus: "IN_PROGRESS",
      taskVersion: 5,
    };
    const versionConflict = Object.assign(new Error("stale"), {
      code: "VERSION_CONFLICT",
      status: 409,
    });
    const readyDetail = {
      checkIn: { conditionCompletedAt: "2026-08-22T09:00:00.000Z" },
      handoff: { pendingAt: null, verification: null },
      keySlot: null,
      locationId: "33333333-3333-4333-8333-333333333333",
      parking: {
        parkedAt: null,
        parkingSpotCode: null,
        parkingStartedAt: null,
        parkingZoneCode: null,
      },
      sessionId,
      state: "COMPLETED",
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
      version: 12,
    };
    const request = vi.fn();
    request.mockResolvedValueOnce(initiateOk); // initiate
    request.mockRejectedValueOnce(versionConflict); // verify fails
    request.mockResolvedValueOnce(readyDetail); // A1 recovery probe

    const controller = new HandoffController({
      apiClient: { request } as unknown as EmployeeApiClient,
      onStateChange: () => undefined,
    });

    await controller.initiate(sessionId, 7);
    // Verify triggers response-loss recovery → A1 shows COMPLETED.
    await controller.verifyPickupCode(sessionId, "0482");

    // The controller adopted COMPLETED from A1 (operation completed elsewhere).
    expect(controller.getState().phase).toBe("completed");
  });

  it("back-nav during incident mutation releases guard without phantom report", async () => {
    let release!: (v: unknown) => void;
    const pending = new Promise<unknown>((res) => {
      release = res;
    });
    const request = vi.fn().mockImplementation(() => pending);
    const controller = new IncidentController(
      { request } as unknown as EmployeeApiClient,
      () => undefined,
    );

    const first = controller.submit({
      description: "Nav test",
      sessionId,
      severity: "LOW",
      type: "OTHER",
    });
    void controller.submit({ ...input0(), sessionId });
    release({
      createdAt: "2026-08-22T12:00:00.000Z",
      incidentId: "99999999-9999-4999-8999-999999999999",
      reportedByMembershipId: "88888888-8888-4888-8888-888888888888",
      sessionId,
      severity: "LOW",
      status: "OPEN",
      type: "OTHER",
    });
    await first;

    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.getState().phase).toBe("reported");
  });

  function input0() {
    return { description: "dup", severity: "LOW" as const, type: "OTHER" as const };
  }
});
