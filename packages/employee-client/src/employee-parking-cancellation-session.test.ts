import { describe, expect, it, vi } from "vitest";
import { EmployeeApiError } from "./api-error";
import { EmployeeParkingCancellationSession } from "./employee-parking-cancellation-session";
import type { EmployeeParkingCancellationTarget } from "./employee-parking-cancellation-types";

const target: EmployeeParkingCancellationTarget = {
  identityGeneration: 7,
  scope: {
    organizationId: "org",
    locationId: "location",
    membershipId: "member",
    shiftId: "shift",
    role: "VALET_EMPLOYEE",
    locationCode: "AMM",
    locationName: "Hotel",
    organizationName: "Operator",
    shiftStartedAt: "2026-10-03T10:00:00Z",
  },
  sessionId: "session",
  taskId: "task",
  expectedSessionVersion: 4,
  expectedTaskVersion: 6,
  expectedShiftId: "shift",
};
const terminal = {
  sessionId: "session",
  taskId: "task",
  sessionVersion: 5,
  taskVersion: 7,
  state: "CANCELLED" as const,
  taskStatus: "CANCELLED" as const,
  cancelledAt: "2026-10-03T10:00:00.000Z",
};
const safe = {
  outcome: "NOT_CANCELLED" as const,
  sessionId: "session",
  taskId: "task",
  sessionVersion: 8,
  taskVersion: 10,
  classification: "PRE_CUSTODY" as const,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const transport = {
    cancel: vi.fn().mockResolvedValue(terminal),
    status: vi.fn(),
  };
  const onCancelled = vi.fn();
  const isCurrent = vi.fn().mockReturnValue(true);
  const session = new EmployeeParkingCancellationSession({
    transport,
    onCancelled,
    isCurrent,
  });
  session.confirm(target);
  return { session, transport, onCancelled, isCurrent };
}
describe("exact pre-custody cancellation ownership", () => {
  it("requires confirmation and keeps a single POST through repeated taps", async () => {
    const { session, transport, onCancelled } = fixture();
    const held = deferred<typeof terminal>();
    transport.cancel.mockReturnValue(held.promise);
    const first = session.submit();
    const second = session.submit();
    expect(first).toBe(second);
    session.confirm({ ...target, taskId: "other" });
    session.dismiss();
    expect(session.protected()).toBe(true);
    held.resolve(terminal);
    await first;
    expect(transport.cancel).toHaveBeenCalledTimes(1);
    expect(transport.status).not.toHaveBeenCalled();
    expect(onCancelled).toHaveBeenCalledExactlyOnceWith(terminal);
  });
  it("converges lost POST responses through exact status without replay", async () => {
    const { session, transport, onCancelled } = fixture();
    transport.cancel.mockRejectedValue(new Error("response lost"));
    transport.status.mockResolvedValue({ outcome: "CANCELLED", ...terminal });
    await session.submit();
    expect(session.current().phase).toBe("cancelled");
    expect(transport.status).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        sessionId: "session",
        taskId: "task",
        expectedShiftId: "shift",
      }),
    );
    expect(onCancelled).toHaveBeenCalledOnce();
    await session.submit();
    expect(transport.cancel).toHaveBeenCalledTimes(1);
  });
  it("uses fresh server versions only after explicit retry confirmation", async () => {
    const { session, transport } = fixture();
    transport.cancel.mockRejectedValue(new Error("lost"));
    transport.status.mockResolvedValue(safe);
    await session.submit();
    expect(session.current().phase).toBe("retry");
    await session.submit();
    expect(transport.cancel).toHaveBeenCalledTimes(1);
    session.retry();
    expect(session.current().phase).toBe("confirming");
    transport.cancel.mockResolvedValue({
      ...terminal,
      sessionVersion: 9,
      taskVersion: 11,
    });
    await session.submit();
    expect(transport.cancel).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedSessionVersion: 8,
        expectedTaskVersion: 10,
      }),
    );
  });
  it("never retries advanced custody or treats missing/foreign targets as success", async () => {
    for (const result of [
      { ...safe, classification: "ADVANCED" },
      { ...safe, taskId: "foreign" },
    ]) {
      const { session, transport, onCancelled } = fixture();
      transport.cancel.mockRejectedValue(new Error("lost"));
      transport.status.mockResolvedValue(result);
      await session.submit();
      expect(session.current().phase).toBe(
        result.taskId === "foreign" ? "uncertain" : "conflict",
      );
      session.retry();
      await session.submit();
      expect(transport.cancel).toHaveBeenCalledTimes(1);
      expect(onCancelled).not.toHaveBeenCalled();
    }
  });
  it.each([401, 403, 404])(
    "clears exact operation on status authority loss %s",
    async (status) => {
      const { session, transport, onCancelled } = fixture();
      transport.cancel.mockRejectedValue(new Error("lost"));
      transport.status.mockRejectedValue(
        new EmployeeApiError({ status, code: "DENIED", message: "Denied" }),
      );
      await session.submit();
      expect(session.current()).toEqual({ phase: "idle", target: null });
      expect(onCancelled).not.toHaveBeenCalled();
    },
  );
  it("background fences POST then validates authority before one GET", async () => {
    const { session, transport, onCancelled } = fixture();
    const held = deferred<typeof terminal>();
    transport.cancel.mockReturnValue(held.promise);
    transport.status.mockResolvedValue({ outcome: "CANCELLED", ...terminal });
    const post = session.submit();
    session.suspendForBackground();
    held.resolve(terminal);
    await post;
    expect(onCancelled).not.toHaveBeenCalled();
    expect(transport.status).not.toHaveBeenCalled();
    await session.resumeAfterAuthorityValidation();
    expect(onCancelled).toHaveBeenCalledOnce();
    expect(transport.cancel).toHaveBeenCalledTimes(1);
  });
  it.each(["POST", "GET"])(
    "fences late %s and A-B-A retirement",
    async (kind) => {
      const { session, transport, onCancelled } = fixture();
      const held = deferred<unknown>();
      if (kind === "POST") transport.cancel.mockReturnValue(held.promise);
      else {
        transport.cancel.mockRejectedValue(new Error("lost"));
        transport.status.mockReturnValue(held.promise);
      }
      const pending = session.submit();
      await Promise.resolve();
      session.clear();
      session.confirm({
        ...target,
        identityGeneration: 8,
        scope: { ...target.scope, shiftId: "B" },
      });
      session.clear();
      session.confirm(target);
      held.resolve(
        kind === "POST" ? terminal : { outcome: "CANCELLED", ...terminal },
      );
      await pending;
      expect(session.current().phase).toBe("confirming");
      expect(onCancelled).not.toHaveBeenCalled();
    },
  );
});
