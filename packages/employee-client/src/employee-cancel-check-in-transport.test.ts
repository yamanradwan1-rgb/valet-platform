import { describe, expect, it, vi } from "vitest";
import { createEmployeeCancelCheckInTransport } from "./employee-cancel-check-in-transport";

const sessionId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const expectedShiftId = "33333333-3333-4333-8333-333333333333";
const terminal = { sessionId, locationId, state: "CANCELLED", version: 2 };
describe("dedicated cancellation transport", () => {
  it("sends only exact version/Shift command and uses a separate safe status GET", async () => {
    const request = vi.fn().mockResolvedValue(terminal);
    const transport = createEmployeeCancelCheckInTransport(
      () => ({ request }) as never,
    );
    expect(
      await transport.cancel(sessionId, {
        expectedVersion: 1,
        expectedShiftId,
      }),
    ).toEqual(terminal);
    expect(request).toHaveBeenLastCalledWith({
      method: "POST",
      path: `/v1/staff/check-in/sessions/${sessionId}/cancel`,
      body: { expectedVersion: 1, expectedShiftId },
    });
    expect(await transport.status(sessionId, expectedShiftId)).toEqual(
      terminal,
    );
    expect(request).toHaveBeenLastCalledWith({
      method: "GET",
      path: `/v1/staff/check-in/sessions/${sessionId}/cancel-status`,
      params: { expectedShiftId },
    });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed/over-broad success rather than silently accepting it", async () => {
    const request = vi.fn();
    const transport = createEmployeeCancelCheckInTransport(
      () => ({ request }) as never,
    );
    for (const response of [
      { ...terminal, credential: "private" },
      { ...terminal, state: "CHECKING_IN" },
      { ...terminal, version: 0 },
    ]) {
      request.mockResolvedValue(response);
      await expect(
        transport.cancel(sessionId, { expectedVersion: 1, expectedShiftId }),
      ).rejects.toThrow();
    }
    request.mockResolvedValue({ ...terminal, state: "UNSUPPORTED" });
    await expect(
      transport.status(sessionId, expectedShiftId),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(4);
  });
});
