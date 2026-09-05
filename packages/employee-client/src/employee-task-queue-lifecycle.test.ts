import { afterEach, describe, expect, it, vi } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  deferred,
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

afterEach(() => vi.useRealTimers());

function queue(version = 2) {
  return Promise.resolve({ tasks: [parkingTask({ version })] });
}

describe("Employee foreground queue lifecycle", () => {
  it("does not start a queue read when authenticated context resolves in background", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(operationalContext()),
    );
    transport.queueResults.push(queue(2));
    const session = new EmployeeOperationalSession({ transport });
    await session.setForeground(false);

    await session.activate(1);
    expect(transport.queueCalls).toHaveLength(0);
    expect(session.current()).toMatchObject({
      phase: "ready",
      queueLoading: false,
    });

    await session.setForeground(true);
    expect(transport.queueCalls).toHaveLength(1);
  });

  it("runs one five-second foreground timer and stops it in background", async () => {
    vi.useFakeTimers();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(operationalContext()),
    );
    transport.queueResults.push(queue(2), queue(3));
    const session = new EmployeeOperationalSession({
      initialForeground: false,
      transport,
    });
    await session.activate(1);
    await session.setForeground(true);

    expect(transport.queueCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(transport.queueCalls).toHaveLength(2);
    expect(session.current().tasks[0]?.version).toBe(3);

    await session.setForeground(false);
    await vi.advanceTimersByTimeAsync(15000);
    expect(transport.queueCalls).toHaveLength(2);
  });

  it("coalesces repeated foreground activations while context is in flight", async () => {
    const context = deferred<ReturnType<typeof operationalContext>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      context.promise,
    );
    transport.queueResults.push(queue(2));
    const session = new EmployeeOperationalSession({
      initialForeground: false,
      transport,
    });
    await session.activate(1);

    const first = session.setForeground(true);
    const second = session.setForeground(true);
    context.resolve(operationalContext());
    await Promise.all([first, second]);

    expect(transport.queueCalls).toHaveLength(1);
  });

  it("does not read the prior scope while resume context revalidation is pending", async () => {
    vi.useFakeTimers();
    const context = deferred<ReturnType<typeof operationalContext>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      context.promise,
    );
    transport.queueResults.push(queue(2), queue(3));
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);
    await session.setForeground(false);

    const foreground = session.setForeground(true);
    await vi.advanceTimersByTimeAsync(10000);
    expect(transport.queueCalls).toHaveLength(1);
    context.resolve(operationalContext());
    await foreground;

    expect(transport.queueCalls).toHaveLength(2);
  });

  it("retains the last verified queue through a temporary refresh failure", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      queue(2),
      Promise.reject(employeeNetworkError()),
      queue(3),
    );
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    await session.refreshQueue();

    expect(session.current()).toMatchObject({
      queueHardStopped: false,
      queueLoading: false,
      queueRefreshing: false,
      tasks: [{ version: 2 }],
    });
    expect(session.current().queueFailure?.code).toBe("NETWORK_ERROR");

    await session.refreshQueue();
    expect(session.current()).toMatchObject({
      queueFailure: null,
      tasks: [{ version: 3 }],
    });
  });

  it("hard-stops and purges the queue on definitive scope loss", async () => {
    vi.useFakeTimers();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      queue(2),
      Promise.reject(
        new EmployeeApiError({
          code: "FORBIDDEN",
          message: "Denied",
          status: 403,
        }),
      ),
    );
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);
    await session.refreshQueue();

    expect(session.current()).toMatchObject({
      queueHardStopped: true,
      tasks: [],
    });
    await session.refreshQueue();
    await vi.advanceTimersByTimeAsync(10000);
    expect(transport.queueCalls).toHaveLength(2);
  });

  it("keeps 429 bounded to the normal timer cadence and recovers", async () => {
    vi.useFakeTimers();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(operationalContext()),
    );
    transport.queueResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "RATE_LIMITED",
          message: "Wait",
          retryAfter: 5,
          status: 429,
        }),
      ),
      queue(3),
    );
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    expect(session.current().queueFailure).toMatchObject({
      code: "RATE_LIMITED",
      retryAfter: 5,
      status: 429,
    });
    expect(transport.queueCalls).toHaveLength(1);
    await session.setForeground(false);
    await session.setForeground(true);
    expect(transport.queueCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4999);
    expect(transport.queueCalls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.queueCalls).toHaveLength(2);
    expect(session.current()).toMatchObject({
      queueFailure: null,
      tasks: [{ version: 3 }],
    });
  });

  it("does not let an aborted same-scope read release its replacement", async () => {
    vi.useFakeTimers();
    const oldQueue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const newQueue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(operationalContext()),
    );
    transport.queueResults.push(queue(2), oldQueue.promise, newQueue.promise);
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);
    await vi.advanceTimersByTimeAsync(5000);
    await session.setForeground(false);

    const foreground = session.setForeground(true);
    await vi.waitFor(() => expect(transport.queueCalls).toHaveLength(3));
    oldQueue.resolve({ tasks: [parkingTask({ version: 7 })] });
    await Promise.resolve();
    const coalesced = session.refreshQueue();
    expect(transport.queueCalls).toHaveLength(3);
    newQueue.resolve({ tasks: [parkingTask({ version: 9 })] });
    await Promise.all([foreground, coalesced]);

    expect(session.current().tasks[0]?.version).toBe(9);
  });

  it("rejects a late prior-Shift response after foreground revalidation", async () => {
    const oldQueue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const replacement = operationalContext();
    const newShiftId = "99999999-9999-4999-8999-999999999999";
    const shifted = {
      contexts: replacement.contexts.map((context) => ({
        ...context,
        activeShift: context.activeShift
          ? { ...context.activeShift, shiftId: newShiftId }
          : null,
      })),
    };
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(shifted),
    );
    transport.queueResults.push(queue(2), oldQueue.promise, queue(9));
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);
    const oldRefresh = session.refreshQueue();
    await session.setForeground(false);
    const foreground = session.setForeground(true);
    await foreground;
    oldQueue.resolve({ tasks: [parkingTask({ version: 3 })] });
    await oldRefresh;

    expect(session.current().scope?.shiftId).toBe(newShiftId);
    expect(session.current().tasks[0]?.version).toBe(9);
    expect(transport.queueCalls).toEqual([
      ids.location,
      ids.location,
      ids.location,
    ]);
  });
});
