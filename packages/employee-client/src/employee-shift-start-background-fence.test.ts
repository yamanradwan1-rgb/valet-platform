import { describe, expect, it, vi } from "vitest";

import { EmployeeOperationalSession } from "./employee-operational-session";
import { operationalContext } from "./employee-operational-test-fixture";
import { EmployeeShiftStartSession } from "./employee-shift-start-session";
import {
  activeShiftResponse,
  deferredShiftStart,
  shiftStartContext,
  shiftStartIds,
  StubShiftStartTransport,
} from "./employee-shift-start-test-fixture";

function readySession(transport: StubShiftStartTransport) {
  const refreshOperationalContext = vi.fn(async () => undefined);
  const session = new EmployeeShiftStartSession({
    refreshOperationalContext,
    transport,
  });
  session.activate(1);
  session.observeOperationalContext(1, shiftStartContext());
  return { refreshOperationalContext, session };
}

describe("Employee Shift start background fence", () => {
  it("turns a pending POST into uncertainty and ignores its late success", async () => {
    const response =
      deferredShiftStart<ReturnType<typeof activeShiftResponse>>();
    const transport = new StubShiftStartTransport();
    transport.results.push(response.promise);
    const { refreshOperationalContext, session } = readySession(transport);

    const start = session.start();
    session.suspendForBackground();
    response.resolve(activeShiftResponse());
    await start;

    expect(session.current()).toMatchObject({
      failure: { code: "SHIFT_START_RESULT_UNKNOWN" },
      phase: "uncertain",
      targetLocationId: shiftStartIds.locationA,
    });
    expect(refreshOperationalContext).not.toHaveBeenCalled();
    expect(transport.calls).toEqual([shiftStartIds.locationA]);
  });

  it("does not replay until explicit retry and preserves its authority", async () => {
    const first = deferredShiftStart<ReturnType<typeof activeShiftResponse>>();
    const transport = new StubShiftStartTransport();
    transport.results.push(
      first.promise,
      Promise.resolve(activeShiftResponse()),
    );
    const { refreshOperationalContext, session } = readySession(transport);
    const start = session.start();
    session.suspendForBackground();
    first.resolve(activeShiftResponse());
    await start;

    await Promise.resolve();
    expect(transport.calls).toHaveLength(1);
    await session.retry();
    expect(transport.calls).toEqual([
      shiftStartIds.locationA,
      shiftStartIds.locationA,
    ]);
    expect(refreshOperationalContext).toHaveBeenCalledOnce();
  });

  it("preserves ready state when no Start Shift work is active", () => {
    const transport = new StubShiftStartTransport();
    const { session } = readySession(transport);
    session.suspendForBackground();
    expect(session.current()).toMatchObject({
      failure: null,
      phase: "ready",
      selectedLocationId: shiftStartIds.locationA,
    });
    expect(transport.calls).toHaveLength(0);
  });

  it("keeps an old completion out of a new identity", async () => {
    const response =
      deferredShiftStart<ReturnType<typeof activeShiftResponse>>();
    const transport = new StubShiftStartTransport();
    transport.results.push(response.promise);
    const { refreshOperationalContext, session } = readySession(transport);
    const start = session.start();
    session.suspendForBackground();
    session.activate(2);
    response.resolve(activeShiftResponse());
    await start;
    expect(session.current()).toMatchObject({
      identityGeneration: 2,
      phase: "inactive",
    });
    expect(refreshOperationalContext).not.toHaveBeenCalled();
  });

  it("notifies Shift observers only after a current context read is accepted", async () => {
    const response =
      deferredShiftStart<ReturnType<typeof operationalContext>>();
    const onOperationalContext = vi.fn();
    const session = new EmployeeOperationalSession({
      initialForeground: true,
      onOperationalContext,
      transport: {
        acceptTask: vi.fn(),
        assignTask: vi.fn(),
        loadOperationalContext: vi.fn(() => response.promise),
        loadTaskQueue: vi.fn(),
      },
    });
    const activation = session.activate(1);
    await session.setForeground(false);
    response.resolve(operationalContext());
    await activation;
    expect(onOperationalContext).not.toHaveBeenCalled();
    expect(session.current().phase).toBe("loading-context");
  });
});
