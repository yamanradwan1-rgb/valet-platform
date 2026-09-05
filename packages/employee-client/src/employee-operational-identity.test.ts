import { describe, expect, it } from "vitest";

import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  acceptedProjection,
  deferred,
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

describe("Employee operational identity generation", () => {
  it("discards a late User A context response after User B activation", async () => {
    const userA = deferred<ReturnType<typeof operationalContext>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      userA.promise,
      Promise.resolve(operationalContext(false)),
    );
    const session = new EmployeeOperationalSession({ transport });

    const first = session.activate(1);
    const second = session.activate(2);
    await second;
    userA.resolve(operationalContext());
    await first;

    expect(session.current()).toMatchObject({
      identityGeneration: 2,
      phase: "no-active-shift",
      tasks: [],
    });
  });

  it("discards a late User A queue response after identity change", async () => {
    const queue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(operationalContext(false)),
    );
    transport.queueResults.push(queue.promise);
    const session = new EmployeeOperationalSession({ transport });

    const first = session.activate(1);
    await Promise.resolve();
    await Promise.resolve();
    await session.activate(2);
    queue.resolve({ tasks: [parkingTask()] });
    await first;

    expect(session.current()).toMatchObject({
      identityGeneration: 2,
      phase: "no-active-shift",
      tasks: [],
    });
  });

  it("discards a late User A mutation response after identity change", async () => {
    const accept = deferred<ReturnType<typeof acceptedProjection>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(operationalContext(false)),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
    transport.acceptResults.push(accept.promise);
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    const mutation = session.acceptTask(ids.task);
    await session.activate(2);
    accept.resolve(acceptedProjection());
    await mutation;

    expect(session.current()).toMatchObject({
      identityGeneration: 2,
      phase: "no-active-shift",
      mutation: { phase: "idle" },
      tasks: [],
    });
  });

  it("clears context, queue, and pending state synchronously on logout purge", async () => {
    const accept = deferred<ReturnType<typeof acceptedProjection>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
    transport.acceptResults.push(accept.promise);
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(5);
    void session.acceptTask(ids.task);

    session.clear();

    expect(session.current()).toMatchObject({
      identityGeneration: null,
      phase: "inactive",
      mutation: { phase: "idle" },
      scope: null,
      tasks: [],
    });
  });

  it("discards an in-flight action after same-login Shift replacement", async () => {
    const accept = deferred<ReturnType<typeof acceptedProjection>>();
    const replacement = operationalContext();
    const nextShiftId = "99999999-9999-4999-8999-999999999999";
    const shifted = {
      contexts: replacement.contexts.map((context) => ({
        ...context,
        activeShift: context.activeShift
          ? { ...context.activeShift, shiftId: nextShiftId }
          : null,
      })),
    };
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(shifted),
    );
    transport.queueResults.push(
      Promise.resolve({ tasks: [parkingTask()] }),
      Promise.resolve({ tasks: [] }),
    );
    transport.acceptResults.push(accept.promise);
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    const mutation = session.acceptTask(ids.task);
    await session.refresh();
    accept.resolve(acceptedProjection());
    await mutation;

    expect(session.current()).toMatchObject({
      identityGeneration: 1,
      mutation: { phase: "idle" },
      scope: { shiftId: nextShiftId },
      tasks: [],
    });
    expect(transport.queueCalls).toHaveLength(2);
  });
});
