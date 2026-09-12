import type { ParkingTaskQueueResponse } from "@valet/contracts";
import { describe, expect, it } from "vitest";

import { employeeNetworkError } from "./api-error";
import { deferred, ids } from "./employee-operational-test-fixture";
import {
  parkingStartHarness,
  parkingStartScope,
} from "./employee-parking-start-test-fixture";

function queuedParkingTask(): ParkingTaskQueueResponse {
  return {
    createdAt: "2026-09-07T08:01:00.000Z",
    currentAssigneeMembershipId: null,
    sessionId: ids.session,
    status: "QUEUED",
    taskId: ids.task,
    taskType: "PARKING",
    version: 1,
  };
}

describe("Parking bootstrap background fence", () => {
  it("blocks a late queue POST from starting reads or publishing success", async () => {
    const test = parkingStartHarness();
    const queued = deferred<ParkingTaskQueueResponse>();
    test.transport.queuedResults.push(queued.promise);
    const bootstrap = test.session.openCompletedCheckIn(
      7,
      parkingStartScope,
      ids.session,
    );
    test.session.suspendForBackground();
    queued.resolve(queuedParkingTask());
    await bootstrap;

    expect(test.session.current()).toMatchObject({
      phase: "loading",
      task: null,
    });
    expect(test.transport.queueTaskCalls).toEqual([ids.session]);
    expect(test.transport.loadQueueCalls).toHaveLength(0);
    expect(test.transport.loadSessionCalls).toHaveLength(0);
  });

  it("recovers on foreground reads without replaying the queue POST", async () => {
    const test = parkingStartHarness();
    const queued = deferred<ParkingTaskQueueResponse>();
    test.transport.queuedResults.push(queued.promise);
    const bootstrap = test.session.openCompletedCheckIn(
      7,
      parkingStartScope,
      ids.session,
    );
    test.session.suspendForBackground();
    queued.resolve(queuedParkingTask());
    await bootstrap;

    await test.session.checkServerState();
    expect(test.session.current()).toMatchObject({
      phase: "accepted",
      task: { taskId: ids.task },
    });
    expect(test.transport.queueTaskCalls).toEqual([ids.session]);
    expect(test.transport.loadQueueCalls).toEqual([
      parkingStartScope.locationId,
    ]);
    expect(test.transport.loadSessionCalls).toEqual([ids.session]);
  });

  it("ignores a late queue POST failure after current reads recover", async () => {
    const test = parkingStartHarness();
    const queued = deferred<ParkingTaskQueueResponse>();
    test.transport.queuedResults.push(queued.promise);
    const bootstrap = test.session.openCompletedCheckIn(
      7,
      parkingStartScope,
      ids.session,
    );
    test.session.suspendForBackground();
    await test.session.checkServerState();
    queued.reject(employeeNetworkError());
    await bootstrap;

    expect(test.session.current().phase).toBe("accepted");
    expect(test.transport.queueTaskCalls).toEqual([ids.session]);
  });

  it("ignores the old bootstrap after workflow retirement", async () => {
    const test = parkingStartHarness();
    const queued = deferred<ParkingTaskQueueResponse>();
    test.transport.queuedResults.push(queued.promise);
    const bootstrap = test.session.openCompletedCheckIn(
      7,
      parkingStartScope,
      ids.session,
    );
    test.session.clear();
    queued.resolve(queuedParkingTask());
    await bootstrap;
    expect(test.session.current().phase).toBe("inactive");
    expect(test.transport.loadQueueCalls).toHaveLength(0);
    expect(test.transport.loadSessionCalls).toHaveLength(0);
  });
});
