import { describe, expect, it, vi } from "vitest";
import { EmployeeTaskQueueOwner } from "./employee-task-queue-owner";
import { deferred, parkingTask } from "./employee-operational-test-fixture";
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
});
