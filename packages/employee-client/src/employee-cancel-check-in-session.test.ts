import { describe, expect, it, vi } from "vitest";
import { EmployeeCancelCheckInSession } from "./employee-cancel-check-in-session";
import type { EmployeeCancelCheckInTransport } from "./employee-cancel-check-in-transport";
import type { EmployeeOperationalScope } from "./employee-operational-types";

const scope = {
  organizationId: "org",
  membershipId: "member",
  locationId: "location",
  shiftId: "shift",
  role: "VALET_EMPLOYEE",
} as EmployeeOperationalScope;
const detail = {
  sessionId: "target",
  locationId: "location",
  state: "CHECKING_IN",
  version: 7,
};
function fixture() {
  const transport = {
    prepare: vi.fn().mockResolvedValue(detail),
    cancel: vi.fn(),
    status: vi.fn(),
  };
  const completed = vi.fn();
  const session = new EmployeeCancelCheckInSession(
    transport as EmployeeCancelCheckInTransport,
    completed,
  );
  session.bind(1, scope);
  return { session, transport, completed };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("cancel operation ownership and request budget", () => {
  it("prepares one exact detail and dispatches one explicit POST with current version/Shift", async () => {
    const { session, transport, completed } = fixture();
    transport.cancel.mockResolvedValue({
      ...detail,
      state: "CANCELLED",
      version: 8,
    });
    await session.prepare("target");
    expect(transport.prepare).toHaveBeenCalledExactlyOnceWith("target");
    expect(transport.cancel).not.toHaveBeenCalled();
    await Promise.all([session.confirm(), session.confirm()]);
    expect(transport.cancel).toHaveBeenCalledExactlyOnceWith("target", {
      expectedVersion: 7,
      expectedShiftId: "shift",
    });
    expect(session.current().phase).toBe("cancelled");
    expect(completed).toHaveBeenCalledExactlyOnceWith("target");
    expect(transport.status).not.toHaveBeenCalled();
  });
  it("holds unknown outcomes, reads once and requires fresh confirmation before any retry", async () => {
    const { session, transport } = fixture();
    transport.cancel.mockRejectedValue(new Error("response lost"));
    await session.prepare("target");
    await session.confirm();
    await session.confirm();
    await session.prepare("different");
    expect(transport.cancel).toHaveBeenCalledTimes(1);
    expect(transport.prepare).toHaveBeenCalledTimes(1);
    transport.status.mockResolvedValue(detail);
    await Promise.all([session.reconcile(), session.reconcile()]);
    expect(transport.status).toHaveBeenCalledExactlyOnceWith("target", "shift");
    expect(session.current().phase).toBe("retry-available");
    await session.confirm();
    expect(transport.cancel).toHaveBeenCalledTimes(1);
    session.confirmRetry();
    await session.confirm();
    expect(transport.cancel).toHaveBeenCalledTimes(2);
  });
  it("converges CANCELLED after lost response and never retries progressed or changed version", async () => {
    for (const result of [
      { ...detail, state: "CANCELLED", version: 8 },
      { ...detail, state: "AWAITING_PARKING", version: 8 },
      { ...detail, version: 8 },
    ]) {
      const { session, transport, completed } = fixture();
      transport.cancel.mockRejectedValue(new Error("lost"));
      transport.status.mockResolvedValue(result);
      await session.prepare("target");
      await session.confirm();
      await session.reconcile();
      expect(session.current().phase).toBe(
        result.state === "CANCELLED" ? "cancelled" : "conflict",
      );
      expect(completed).toHaveBeenCalledTimes(
        result.state === "CANCELLED" ? 1 : 0,
      );
      session.confirmRetry();
      await session.confirm();
      expect(transport.cancel).toHaveBeenCalledTimes(1);
    }
  });
  it("fences A to B to A, auth, Shift, role and clear at every asynchronous boundary", async () => {
    for (const boundary of ["prepare", "cancel", "status"] as const) {
      const { session, transport, completed } = fixture();
      const held = deferred<unknown>();
      if (boundary !== "prepare") await session.prepare("target");
      if (boundary === "status") {
        transport.cancel.mockRejectedValue(new Error("lost"));
        await session.confirm();
      }
      transport[boundary].mockReturnValue(held.promise);
      const operation =
        boundary === "prepare"
          ? session.prepare("target")
          : boundary === "cancel"
            ? session.confirm()
            : session.reconcile();
      session.bind(1, {
        ...scope,
        shiftId: "replacement",
        role: "VALET_SUPERVISOR",
      });
      session.bind(1, scope);
      held.resolve({ ...detail, state: "CANCELLED", version: 8 });
      await operation;
      expect(session.current()).toEqual({ phase: "inactive", sessionId: null });
      expect(completed).not.toHaveBeenCalled();
      session.bind(2, scope);
      session.clear();
      expect(session.current().phase).toBe("inactive");
    }
  });
  it("background invalidates preparation and keeps a dispatched mutation unknown without duplicate POST", async () => {
    const { session, transport, completed } = fixture();
    const held = deferred<unknown>();
    await session.prepare("target");
    transport.cancel.mockReturnValue(held.promise);
    const operation = session.confirm();
    session.suspendForBackground();
    expect(session.current().phase).toBe("unknown");
    transport.status.mockResolvedValue(detail);
    await session.reconcile();
    session.confirmRetry();
    await session.confirm();
    expect(transport.cancel).toHaveBeenCalledTimes(1);
    held.resolve({ ...detail, state: "CANCELLED", version: 8 });
    await operation;
    expect(completed).not.toHaveBeenCalled();
    session.confirmRetry();
    expect(session.current().phase).toBe("confirm");
  });
  it("rejects wrong target/location/state and treats invalid success responses as unknown", async () => {
    for (const invalid of [
      { ...detail, sessionId: "other" },
      { ...detail, locationId: "other" },
      { ...detail, state: "AWAITING_PARKING" },
    ]) {
      const { session, transport } = fixture();
      transport.prepare.mockResolvedValue(invalid);
      await session.prepare("target");
      await session.confirm();
      expect(session.current().phase).toBe("conflict");
      expect(transport.cancel).not.toHaveBeenCalled();
    }
    const { session, transport } = fixture();
    await session.prepare("target");
    transport.cancel.mockResolvedValue({ ...detail, version: 99 });
    await session.confirm();
    expect(session.current().phase).toBe("unknown");
  });
});
