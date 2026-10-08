import { afterEach, describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "./api-error";
import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  deferred,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

afterEach(() => vi.useRealTimers());

describe("Issue 272: read-only warm Tasks entry", () => {
  it("does not mistake a pre-mutation in-flight empty GET for a post-entry queue", async () => {
    const oldQueue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({ tasks: [] }),
      oldQueue.promise,
      Promise.resolve({
        tasks: [parkingTask({ status: "ACCEPTED", version: 3 })],
      }),
    );
    const session = new EmployeeOperationalSession({ transport });
    const timeline: string[] = [];
    const unsubscribe = session.subscribe((snapshot) => {
      timeline.push(
        `${snapshot.successfulQueueSnapshotCount}:${snapshot.tasks.length}:${snapshot.queueFailure?.code ?? "ok"}`,
      );
    });
    try {
      await session.activate(1);
      expect(session.current().tasks).toEqual([]);
      const oldRequest = session.refreshQueue();
      // Canonical Check-In/assignment commits while the old GET is pending.
      const enteredTasks = session.refreshQueueForNavigation();
      expect(transport.queueCalls).toHaveLength(3);
      await enteredTasks;
      oldQueue.resolve({ tasks: [] });
      await oldRequest;
      expect(session.current().tasks).toMatchObject([
        { status: "ACCEPTED", version: 3 },
      ]);
      expect(timeline.at(-1)).toBe("2:1:ok");
      expect(transport.acceptCalls).toHaveLength(0);
      expect(transport.assignCalls).toHaveLength(0);
    } finally {
      unsubscribe();
      session.dispose();
    }
  });

  it("coalesces repeated same-route requests during an already fresh entry GET", async () => {
    const oldQueue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const entryQueue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({ tasks: [] }),
      oldQueue.promise,
      entryQueue.promise,
    );
    const session = new EmployeeOperationalSession({ transport });
    try {
      await session.activate(1);
      const previous = session.refreshQueue();
      const firstEntry = session.refreshQueueForNavigation();
      const repeatedEntry = session.refreshQueueForNavigation();
      expect(transport.queueCalls).toHaveLength(3);
      oldQueue.resolve({ tasks: [] });
      entryQueue.resolve({
        tasks: [parkingTask({ status: "IN_PROGRESS", version: 4 })],
      });
      await Promise.all([previous, firstEntry, repeatedEntry]);
      expect(session.current().tasks).toMatchObject([
        { status: "IN_PROGRESS", version: 4 },
      ]);
      expect(transport.acceptCalls).toEqual([]);
      expect(transport.assignCalls).toEqual([]);
    } finally {
      session.dispose();
    }
  });

  it("does not bypass HTTP 429 Retry-After on route entry", async () => {
    vi.useFakeTimers();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "RATE_LIMITED",
          message: "Backoff",
          retryAfter: 10,
          status: 429,
        }),
      ),
      Promise.resolve({ tasks: [parkingTask()] }),
    );
    const session = new EmployeeOperationalSession({ transport });
    try {
      await session.activate(1);
      await session.refreshQueueForNavigation();
      expect(transport.queueCalls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(5000);
      await session.refreshQueueForNavigation();
      expect(transport.queueCalls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(transport.queueCalls).toHaveLength(2);
    } finally {
      session.dispose();
    }
  });

  it.each([401, 403, 404])("preserves %i hard-stop across route entry", async (status) => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.reject(
        new EmployeeApiError({ code: "FORBIDDEN", message: "Denied", status }),
      ),
    );
    const session = new EmployeeOperationalSession({ transport });
    try {
      await session.activate(1);
      expect(session.current().queueHardStopped).toBe(true);
      await session.refreshQueueForNavigation();
      expect(transport.queueCalls).toHaveLength(1);
    } finally {
      session.dispose();
    }
  });
});
