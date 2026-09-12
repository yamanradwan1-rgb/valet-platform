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

function queuedTask() {
  return parkingTask({
    currentAssigneeMembershipId: null,
    status: "QUEUED",
    taskType: "RETRIEVAL",
  });
}

function assignedProjection() {
  return {
    ...acceptedProjection(),
    status: "ASSIGNED" as const,
    taskType: "RETRIEVAL" as const,
    version: 3,
  };
}

async function ready(task = parkingTask()) {
  const transport = new StubOperationalTransport();
  transport.contextResults.push(Promise.resolve(operationalContext()));
  transport.queueResults.push(Promise.resolve({ tasks: [task] }));
  const session = new EmployeeOperationalSession({ transport });
  await session.activate(1);
  return { session, transport };
}

async function foregroundWith(
  session: EmployeeOperationalSession,
  transport: StubOperationalTransport,
  task: ReturnType<typeof parkingTask>,
) {
  transport.contextResults.push(Promise.resolve(operationalContext()));
  transport.queueResults.push(Promise.resolve({ tasks: [task] }));
  await session.setForeground(true);
}

describe("Employee Task action background fence", () => {
  it("stops claim-and-accept after a late assignment response", async () => {
    const test = await ready(queuedTask());
    const assignment = deferred<ReturnType<typeof assignedProjection>>();
    test.transport.assignResults.push(assignment.promise);
    const action = test.session.acceptTask(ids.task);

    await test.session.setForeground(false);
    assignment.resolve(assignedProjection());
    await action;

    expect(test.transport.assignCalls).toHaveLength(1);
    expect(test.transport.acceptCalls).toHaveLength(0);
    expect(test.transport.queueCalls).toHaveLength(1);
    expect(test.session.current().mutation.phase).toBe("reconciling");

    await foregroundWith(
      test.session,
      test.transport,
      parkingTask({ status: "ASSIGNED", taskType: "RETRIEVAL", version: 3 }),
    );
    expect(test.session.current().mutation.phase).toBe("retry-available");
    expect(test.transport.assignCalls).toHaveLength(1);
    expect(test.transport.acceptCalls).toHaveLength(0);
  });

  it("ignores a late accept response and reconciles by foreground GET", async () => {
    const test = await ready();
    const accepted = deferred<ReturnType<typeof acceptedProjection>>();
    test.transport.acceptResults.push(accepted.promise);
    const action = test.session.acceptTask(ids.task);

    await test.session.setForeground(false);
    accepted.resolve(acceptedProjection());
    await action;

    expect(test.transport.acceptCalls).toHaveLength(1);
    expect(test.transport.queueCalls).toHaveLength(1);
    expect(test.session.current().mutation.phase).toBe("reconciling");

    await foregroundWith(
      test.session,
      test.transport,
      parkingTask({ status: "ACCEPTED", version: 3 }),
    );
    expect(test.session.current().mutation.phase).toBe("accepted");
    expect(test.transport.acceptCalls).toHaveLength(1);
  });

  it("aborts command reconciliation reads when background wins", async () => {
    const test = await ready();
    const queue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    test.transport.acceptResults.push(Promise.resolve(acceptedProjection()));
    test.transport.queueResults.push(queue.promise);
    const action = test.session.acceptTask(ids.task);
    await Promise.resolve();
    await Promise.resolve();
    expect(test.session.current().mutation.phase).toBe("reconciling");

    await test.session.setForeground(false);
    queue.resolve({ tasks: [parkingTask({ status: "ACCEPTED", version: 3 })] });
    await action;
    expect(test.session.current().mutation.phase).toBe("reconciling");

    await foregroundWith(
      test.session,
      test.transport,
      parkingTask({ status: "ACCEPTED", version: 3 }),
    );
    expect(test.session.current().mutation.phase).toBe("accepted");
    expect(test.transport.acceptCalls).toHaveLength(1);
  });

  it("lets identity replacement retire the old pending action", async () => {
    const test = await ready(queuedTask());
    const assignment = deferred<ReturnType<typeof assignedProjection>>();
    test.transport.assignResults.push(assignment.promise);
    const action = test.session.acceptTask(ids.task);
    test.session.clear();
    test.transport.contextResults.push(Promise.resolve(operationalContext()));
    test.transport.queueResults.push(
      Promise.resolve({ tasks: [parkingTask()] }),
    );
    await test.session.activate(2);

    assignment.resolve(assignedProjection());
    await action;
    expect(test.session.current().identityGeneration).toBe(2);
    expect(test.session.current().mutation.phase).toBe("idle");
    expect(test.transport.acceptCalls).toHaveLength(0);
  });
});
