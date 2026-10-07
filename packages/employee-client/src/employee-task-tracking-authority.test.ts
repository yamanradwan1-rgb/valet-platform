import { describe, expect, it } from "vitest";

import { employeeNetworkError } from "./api-error";
import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  deferred,
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

const trackingSessionId = "77777777-7777-4777-8777-777777777777";

function eligibleQueue() {
  return Promise.resolve({
    tasks: [
      parkingTask({
        status: "IN_PROGRESS",
        valetSessionState: "PARKING",
      }),
    ],
    tracking: {
      movement: {
        sessionId: ids.session,
        taskId: ids.task,
        taskType: "PARKING" as const,
        trackingSessionId,
        trackingStartedAt: "2026-10-07T00:00:00.000Z",
      },
      status: "ELIGIBLE" as const,
    },
  });
}

describe("#270 operational tracking authority", () => {
  it("publishes the opted-in server projection independently from task display", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(eligibleQueue());
    const session = new EmployeeOperationalSession({ transport });

    await session.activate(1);

    expect(session.current().taskTracking).toEqual({
      movement: {
        sessionId: ids.session,
        taskId: ids.task,
        taskType: "PARKING",
        trackingSessionId,
        trackingStartedAt: "2026-10-07T00:00:00.000Z",
      },
      status: "ELIGIBLE",
    });
  });

  it("fails tracking closed on a transient queue failure while retaining displayed tasks", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(eligibleQueue(), Promise.reject(employeeNetworkError()));
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    await session.refreshQueue();

    expect(session.current().tasks).toHaveLength(1);
    expect(session.current().taskTracking).toBeNull();
    expect(session.current().queueFailure?.code).toBe("NETWORK_ERROR");
  });

  it("retires authority in background and requires fresh context before restoring it", async () => {
    const context = deferred<ReturnType<typeof operationalContext>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      context.promise,
    );
    transport.queueResults.push(eligibleQueue(), eligibleQueue());
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    await session.setForeground(false);
    expect(session.current().taskTracking).toBeNull();
    const resume = session.setForeground(true);
    await Promise.resolve();
    expect(transport.queueCalls).toHaveLength(1);
    expect(session.current().taskTracking).toBeNull();

    context.resolve(operationalContext());
    await resume;
    expect(transport.queueCalls).toHaveLength(2);
    expect(session.current().taskTracking?.status).toBe("ELIGIBLE");
  });

  it.each(["NONE", "AMBIGUOUS"] as const)(
    "keeps %s projection fail closed without candidate identity",
    async (status) => {
      const transport = new StubOperationalTransport();
      transport.contextResults.push(Promise.resolve(operationalContext()));
      transport.queueResults.push(
        Promise.resolve({ tasks: [parkingTask()], tracking: { status } }),
      );
      const session = new EmployeeOperationalSession({ transport });
      await session.activate(1);
      expect(session.current().taskTracking).toEqual({ status });
    },
  );
});
