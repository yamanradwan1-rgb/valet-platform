import { describe, expect, it } from "vitest";

import { EmployeeApiError } from "./api-error";
import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  acceptedProjection,
  deferred,
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

describe("Employee task action authority fencing", () => {
  it("purges an in-flight action when queue access is definitively revoked", async () => {
    const accept = deferred<ReturnType<typeof acceptedProjection>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({ tasks: [parkingTask()] }),
      Promise.reject(
        new EmployeeApiError({
          code: "FORBIDDEN",
          message: "Access revoked",
          status: 403,
        }),
      ),
    );
    transport.acceptResults.push(accept.promise);
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    const action = session.acceptTask(ids.task);
    await session.refreshQueue();
    accept.resolve(acceptedProjection());
    await action;

    expect(session.current()).toMatchObject({
      mutation: { phase: "idle" },
      queueHardStopped: true,
      tasks: [],
    });
    expect(transport.acceptCalls).toHaveLength(1);
    expect(transport.queueCalls).toHaveLength(2);
  });

  it("discards both prior-Location reads and in-flight actions", async () => {
    const oldQueue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const accept = deferred<ReturnType<typeof acceptedProjection>>();
    const nextLocationId = "99999999-9999-4999-8999-999999999999";
    const replacement = operationalContext();
    const moved = {
      contexts: replacement.contexts.map((context) => ({
        ...context,
        activeShift: context.activeShift
          ? { ...context.activeShift, locationId: nextLocationId }
          : null,
        currentLocation: context.currentLocation
          ? { ...context.currentLocation, locationId: nextLocationId }
          : null,
      })),
    };
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(moved),
    );
    transport.queueResults.push(
      Promise.resolve({ tasks: [parkingTask()] }),
      oldQueue.promise,
      Promise.resolve({ tasks: [] }),
    );
    transport.acceptResults.push(accept.promise);
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    const oldRead = session.refreshQueue();
    const action = session.acceptTask(ids.task);
    await session.refresh();
    accept.resolve(acceptedProjection());
    oldQueue.resolve({ tasks: [parkingTask({ version: 7 })] });
    await Promise.all([oldRead, action]);

    expect(session.current()).toMatchObject({
      mutation: { phase: "idle" },
      scope: { locationId: nextLocationId },
      successfulQueueSnapshotCount: 1,
      tasks: [],
    });
    expect(transport.queueCalls).toEqual([
      ids.location,
      ids.location,
      nextLocationId,
    ]);
  });
});
