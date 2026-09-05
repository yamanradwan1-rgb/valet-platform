import { describe, expect, it } from "vitest";

import { EmployeeApiError, employeeNetworkError } from "./api-error";
import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  acceptedProjection,
  deferred,
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

function readySession(queueAfter: ReturnType<typeof parkingTask>[]) {
  const transport = new StubOperationalTransport();
  transport.contextResults.push(Promise.resolve(operationalContext()));
  transport.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
  const session = new EmployeeOperationalSession({ transport });
  return session.activate(1).then(() => {
    transport.queueResults.push(Promise.resolve({ tasks: queueAfter }));
    return { session, transport };
  });
}

describe("Employee self-accept recovery", () => {
  it("submits the exact current expectedVersion and reconciles accepted state", async () => {
    const { session, transport } = await readySession([
      parkingTask({ status: "ACCEPTED", version: 3 }),
    ]);
    transport.acceptResults.push(Promise.resolve(acceptedProjection()));

    await session.acceptTask(ids.task);

    expect(transport.acceptCalls).toEqual([
      { taskId: ids.task, expectedVersion: 2 },
    ]);
    expect(session.current().mutation.phase).toBe("accepted");
  });

  it("coalesces immediate duplicate taps into one POST", async () => {
    const { session, transport } = await readySession([
      parkingTask({ status: "ACCEPTED", version: 3 }),
    ]);
    const accept = deferred<ReturnType<typeof acceptedProjection>>();
    transport.acceptResults.push(accept.promise);

    const first = session.acceptTask(ids.task);
    const second = session.acceptTask(ids.task);
    expect(first).toBe(second);
    expect(transport.acceptCalls).toHaveLength(1);
    accept.resolve(acceptedProjection());
    await first;
  });

  it("rehydrates VERSION_CONFLICT and shows authoritative conflict", async () => {
    const { session, transport } = await readySession([
      parkingTask({
        currentAssigneeMembershipId: "88888888-8888-4888-8888-888888888888",
        version: 3,
      }),
    ]);
    transport.acceptResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "VERSION_CONFLICT",
          message: "Changed",
          status: 409,
        }),
      ),
    );

    await session.acceptTask(ids.task);

    expect(transport.acceptCalls).toHaveLength(1);
    expect(session.current().mutation.phase).toBe("conflict");
    expect(session.current().tasks[0]?.version).toBe(3);
  });

  it("reconciles a committed-but-lost response with exactly one POST", async () => {
    const { session, transport } = await readySession([
      parkingTask({ status: "ACCEPTED", version: 3 }),
    ]);
    transport.acceptResults.push(Promise.reject(employeeNetworkError()));

    await session.acceptTask(ids.task);

    expect(session.current().mutation.phase).toBe("accepted");
    expect(transport.acceptCalls).toHaveLength(1);
    expect(transport.queueCalls).toHaveLength(2);
  });

  it("does not replay an ambiguous pre-commit failure and offers explicit retry", async () => {
    const { session, transport } = await readySession([parkingTask()]);
    transport.acceptResults.push(Promise.reject(employeeNetworkError()));

    await session.acceptTask(ids.task);

    expect(session.current().mutation.phase).toBe("retry-available");
    expect(transport.acceptCalls).toHaveLength(1);
  });

  it("issues a second POST only after an explicit retry against current state", async () => {
    const { session, transport } = await readySession([parkingTask()]);
    transport.acceptResults.push(Promise.reject(employeeNetworkError()));
    await session.acceptTask(ids.task);
    transport.acceptResults.push(Promise.resolve(acceptedProjection()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [parkingTask({ status: "ACCEPTED", version: 3 })],
      }),
    );

    await session.acceptTask(ids.task);

    expect(transport.acceptCalls).toEqual([
      { expectedVersion: 2, taskId: ids.task },
      { expectedVersion: 2, taskId: ids.task },
    ]);
    expect(session.current().mutation.phase).toBe("accepted");
  });

  it("uses current authoritative state when ambiguity resolves incompatibly", async () => {
    const { session, transport } = await readySession([
      parkingTask({ status: "IN_PROGRESS", version: 4 }),
    ]);
    transport.acceptResults.push(Promise.reject(employeeNetworkError()));

    await session.acceptTask(ids.task);

    expect(session.current().mutation.phase).toBe("conflict");
    expect(transport.acceptCalls).toHaveLength(1);
  });

  it("keeps ambiguity explicit when authoritative recovery is unavailable", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);
    transport.acceptResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(Promise.reject(employeeNetworkError()));

    await session.acceptTask(ids.task);

    expect(session.current().mutation.phase).toBe("recovery-unavailable");
    expect(transport.acceptCalls).toHaveLength(1);
  });

  it("self-claims a queued task and accepts with the assigned server version", async () => {
    const queued = parkingTask({
      currentAssigneeMembershipId: null,
      status: "QUEUED",
      taskType: "RETRIEVAL",
    });
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({ tasks: [queued] }),
      Promise.resolve({
        tasks: [
          parkingTask({
            status: "ACCEPTED",
            taskType: "RETRIEVAL",
            version: 4,
          }),
        ],
      }),
    );
    transport.assignResults.push(
      Promise.resolve({
        ...acceptedProjection(),
        status: "ASSIGNED",
        taskType: "RETRIEVAL",
        version: 3,
      }),
    );
    transport.acceptResults.push(
      Promise.resolve({
        ...acceptedProjection(),
        taskType: "RETRIEVAL",
        version: 4,
      }),
    );
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    await session.acceptTask(ids.task);

    expect(transport.assignCalls).toEqual([
      { expectedVersion: 2, taskId: ids.task },
    ]);
    expect(transport.acceptCalls).toEqual([
      { expectedVersion: 3, taskId: ids.task },
    ]);
    expect(session.current().mutation.phase).toBe("accepted");
  });

  it("coalesces repeated claim taps through the complete two-command action", async () => {
    const queued = parkingTask({
      currentAssigneeMembershipId: null,
      status: "QUEUED",
    });
    const assign = deferred<ReturnType<typeof acceptedProjection>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({ tasks: [queued] }),
      Promise.resolve({
        tasks: [parkingTask({ status: "ACCEPTED", version: 4 })],
      }),
    );
    transport.assignResults.push(assign.promise);
    transport.acceptResults.push(
      Promise.resolve({ ...acceptedProjection(), version: 4 }),
    );
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    const first = session.acceptTask(ids.task);
    const second = session.acceptTask(ids.task);
    expect(first).toBe(second);
    assign.resolve({ ...acceptedProjection(), status: "ASSIGNED", version: 3 });
    await first;

    expect(transport.assignCalls).toHaveLength(1);
    expect(transport.acceptCalls).toHaveLength(1);
  });

  it("requires an explicit retry after an uncertain claim resolves to assigned", async () => {
    const queued = parkingTask({
      currentAssigneeMembershipId: null,
      status: "QUEUED",
    });
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({ tasks: [queued] }),
      Promise.resolve({ tasks: [parkingTask({ version: 3 })] }),
    );
    transport.assignResults.push(Promise.reject(employeeNetworkError()));
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    await session.acceptTask(ids.task);

    expect(session.current().mutation.phase).toBe("retry-available");
    expect(transport.assignCalls).toHaveLength(1);
    expect(transport.acceptCalls).toHaveLength(0);
  });

  it("does not claim a queued task already assigned to another membership", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          parkingTask({
            currentAssigneeMembershipId: "88888888-8888-4888-8888-888888888888",
            status: "QUEUED",
          }),
        ],
      }),
    );
    const session = new EmployeeOperationalSession({ transport });
    await session.activate(1);

    await session.acceptTask(ids.task);

    expect(transport.assignCalls).toHaveLength(0);
    expect(transport.acceptCalls).toHaveLength(0);
  });
});
