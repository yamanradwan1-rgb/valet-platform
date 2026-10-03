import { describe, expect, it, vi } from "vitest";
import { employeeNetworkError } from "./api-error";
import { EmployeeOperationalSession } from "./employee-operational-session";
import { EmployeeTaskQueueOwner } from "./employee-task-queue-owner";
import {
  deferred,
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";
import type {
  EmployeeOperationalScope,
  EmployeeOperationalTransport,
} from "./employee-operational-types";

describe("terminal parking mutation queue freshness", () => {
  it("performs one fresh queue read and rejects a late pre-cancellation snapshot even if abort is ignored", async () => {
    const stale = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const loadTaskQueue = vi
      .fn()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValue({ tasks: [] });
    const onSnapshot = vi.fn();
    const scope = {
      organizationId: "org",
      membershipId: "member",
      locationId: "location",
      shiftId: "shift",
    } as EmployeeOperationalScope;
    const owner = new EmployeeTaskQueueOwner({
      intervalMs: 60_000,
      onSnapshot,
      transport: { loadTaskQueue } as unknown as EmployeeOperationalTransport,
    });
    owner.setForeground(true);
    try {
      const old = owner.setScope(7, scope).promise;
      await owner.refreshAfterTerminalMutation();
      expect(loadTaskQueue).toHaveBeenCalledTimes(2);
      expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({
        tasks: [],
        successfulSnapshotCount: 1,
      });
      stale.resolve({ tasks: [parkingTask()] });
      await old;
      expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({
        tasks: [],
        successfulSnapshotCount: 1,
      });
      expect(loadTaskQueue).toHaveBeenCalledTimes(2);
    } finally {
      owner.dispose();
    }
  });
  it("evicts only the confirmed task immediately and preserves that eviction through stale and failed reads", async () => {
    const stale = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const fresh = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const otherTaskId = "77777777-7777-4777-8777-777777777777";
    const laterTaskId = "99999999-9999-4999-8999-999999999999";
    const other = parkingTask({
      sessionId: "88888888-8888-4888-8888-888888888888",
      taskId: otherTaskId,
    });
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({ tasks: [parkingTask(), other] }),
      stale.promise,
      fresh.promise,
    );
    const session = new EmployeeOperationalSession({ transport });
    try {
      await session.activate(7);
      const oldRead = session.refreshQueue();
      const retirement = session.retireTaskAfterTerminalMutation(ids.task);

      expect(session.current().tasks.map((task) => task.taskId)).toEqual([
        otherTaskId,
      ]);
      expect(transport.queueCalls).toHaveLength(3);

      fresh.reject(employeeNetworkError());
      await retirement;
      expect(session.current().queueFailure?.code).toBe("NETWORK_ERROR");
      expect(session.current().tasks.map((task) => task.taskId)).toEqual([
        otherTaskId,
      ]);

      stale.resolve({ tasks: [parkingTask(), other] });
      await oldRead;
      expect(session.current().tasks.map((task) => task.taskId)).toEqual([
        otherTaskId,
      ]);

      transport.queueResults.push(
        Promise.resolve({
          tasks: [
            other,
            parkingTask({
              sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              taskId: laterTaskId,
            }),
          ],
        }),
      );
      await session.refreshQueue();
      expect(session.current().tasks.map((task) => task.taskId)).toEqual([
        otherTaskId,
        laterTaskId,
      ]);
      expect(transport.queueCalls).toHaveLength(4);
    } finally {
      session.dispose();
    }
  });
});
