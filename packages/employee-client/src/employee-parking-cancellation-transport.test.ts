import { describe, expect, it, vi } from "vitest";
import { createEmployeeParkingCancellationTransport } from "./employee-parking-cancellation-transport";
import { EmployeeClient } from "./employee-client";
import type { EmployeeParkingCancellationTarget } from "./employee-parking-cancellation-types";

const target = {
  sessionId: "44444444-4444-4444-8444-444444444444",
  taskId: "66666666-6666-4666-8666-666666666666",
  expectedShiftId: "55555555-5555-4555-8555-555555555555",
  expectedSessionVersion: 2,
  expectedTaskVersion: 3,
  identityGeneration: 7,
  scope: { organizationId: "must-not-send", membershipId: "must-not-send" },
} as EmployeeParkingCancellationTarget;
const terminal = {
  sessionId: target.sessionId,
  taskId: target.taskId,
  sessionVersion: 3,
  taskVersion: 4,
  state: "CANCELLED",
  taskStatus: "CANCELLED",
  cancelledAt: "2026-10-03T10:00:00.000Z",
};
describe("parking cancellation transport privacy and replay budget", () => {
  it("sends only strict command/status selectors and rejects polluted server data", async () => {
    const request = vi.fn().mockResolvedValue(terminal);
    const transport = createEmployeeParkingCancellationTransport(
      () => ({ request }) as never,
    );
    await transport.cancel(target);
    expect(request).toHaveBeenLastCalledWith({
      method: "POST",
      path: `/v1/staff/valet-sessions/${target.sessionId}/cancel-before-parking`,
      body: {
        taskId: target.taskId,
        expectedShiftId: target.expectedShiftId,
        expectedSessionVersion: 2,
        expectedTaskVersion: 3,
      },
    });
    request.mockResolvedValue({ outcome: "CANCELLED", ...terminal });
    await transport.status(target);
    expect(request).toHaveBeenLastCalledWith({
      method: "GET",
      path: `/v1/staff/valet-sessions/${target.sessionId}/parking-cancellation-status`,
      params: {
        taskId: target.taskId,
        expectedShiftId: target.expectedShiftId,
      },
    });
    request.mockResolvedValue({
      outcome: "CANCELLED",
      ...terminal,
      customerToken: "forbidden",
    });
    await expect(transport.status(target)).rejects.toMatchObject({
      status: 502,
    });
    request.mockResolvedValue({
      sessionId: target.sessionId,
      outcome: "CANCELLED",
    });
    await expect(transport.status(target)).rejects.toMatchObject({
      status: 502,
    });
  });
  it("does not authorize refresh-and-replay of a 401 mutation", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ status: 401, payload: { code: "AUTH_REQUIRED" } });
    const refreshAuthorization = vi.fn().mockResolvedValue("refreshed");
    const client = new EmployeeClient({
      transport: { execute },
      authorizationRecovery: {
        allowRefresh: true,
        refreshAuthorization,
      },
    });
    await expect(
      createEmployeeParkingCancellationTransport(() => client).cancel(target),
    ).rejects.toMatchObject({ status: 401 });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(refreshAuthorization).not.toHaveBeenCalled();
  });
});
