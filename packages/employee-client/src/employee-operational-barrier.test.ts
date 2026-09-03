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

const otherTaskId = "77777777-7777-4777-8777-777777777777";
const tasks = () => [parkingTask(), parkingTask({ taskId: otherTaskId })];

async function ready() {
  const transport = new StubOperationalTransport();
  transport.contextResults.push(Promise.resolve(operationalContext()));
  transport.queueResults.push(Promise.resolve({ tasks: tasks() }));
  const session = new EmployeeOperationalSession({ transport });
  await session.activate(1);
  return { session, transport };
}

async function unavailable() {
  const test = await ready();
  test.transport.acceptResults.push(Promise.reject(employeeNetworkError()));
  test.transport.queueResults.push(Promise.reject(employeeNetworkError()));
  await test.session.acceptTask(ids.task);
  expect(test.session.current().mutation.phase).toBe("recovery-unavailable");
  expect(test.transport.acceptCalls).toHaveLength(1);
  return test;
}

describe("Employee single unresolved accept barrier", () => {
  it("blocks both the same and another Task after ambiguous POST and failed GET", async () => {
    const { session, transport } = await unavailable();

    await session.acceptTask(ids.task);
    await session.acceptTask(otherTaskId);

    expect(transport.acceptCalls).toHaveLength(1);
    expect(session.current().mutation).toMatchObject({
      phase: "recovery-unavailable",
      taskId: ids.task,
    });
  });

  it("blocks another Task while the original POST is submitting", async () => {
    const { session, transport } = await ready();
    const post = deferred<ReturnType<typeof acceptedProjection>>();
    transport.acceptResults.push(post.promise);
    transport.queueResults.push(
      Promise.resolve({
        tasks: [parkingTask({ status: "ACCEPTED", version: 3 })],
      }),
    );

    const operation = session.acceptTask(ids.task);
    expect(session.acceptTask(otherTaskId)).toBe(operation);
    expect(session.current().mutation.phase).toBe("submitting");
    expect(transport.acceptCalls).toHaveLength(1);
    post.resolve(acceptedProjection());
    await operation;
  });

  it("blocks another Task while authoritative reconciliation is pending", async () => {
    const { session, transport } = await ready();
    const queue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    transport.acceptResults.push(Promise.reject(employeeNetworkError()));
    transport.queueResults.push(queue.promise);

    const operation = session.acceptTask(ids.task);
    await Promise.resolve();
    expect(session.current().mutation.phase).toBe("reconciling");
    expect(session.acceptTask(otherTaskId)).toBe(operation);
    expect(transport.acceptCalls).toHaveLength(1);
    queue.resolve({ tasks: tasks() });
    await operation;
  });

  it("allows explicit retry only after a successful authoritative reread", async () => {
    const { session, transport } = await unavailable();
    transport.queueResults.push(Promise.resolve({ tasks: tasks() }));

    await session.refreshQueue();

    expect(session.current().mutation.phase).toBe("retry-available");
    expect(transport.acceptCalls).toHaveLength(1);
    transport.acceptResults.push(Promise.resolve(acceptedProjection()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [parkingTask({ status: "ACCEPTED", version: 3 })],
      }),
    );
    await session.acceptTask(ids.task);
    expect(transport.acceptCalls).toHaveLength(2);
    expect(session.current().mutation.phase).toBe("accepted");
  });

  it("preserves ambiguity through AppState-equivalent context reload until queue proof", async () => {
    const { session, transport } = await unavailable();
    const context = deferred<ReturnType<typeof operationalContext>>();
    const queue = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    transport.contextResults.push(context.promise);
    transport.queueResults.push(queue.promise);

    const refresh = session.refresh();
    expect(session.current().mutation.phase).toBe("recovery-unavailable");
    context.resolve(operationalContext());
    await Promise.resolve();
    expect(session.current().mutation.phase).toBe("recovery-unavailable");
    await session.acceptTask(otherTaskId);
    queue.resolve({ tasks: [parkingTask({ status: "ACCEPTED", version: 3 })] });
    await refresh;

    expect(session.current().mutation.phase).toBe("accepted");
    expect(transport.acceptCalls).toHaveLength(1);
  });

  it("does not reconcile a context-refresh queue while the POST is in flight", async () => {
    const { session, transport } = await ready();
    const post = deferred<ReturnType<typeof acceptedProjection>>();
    transport.acceptResults.push(post.promise);
    const operation = session.acceptTask(ids.task);
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(Promise.resolve({ tasks: tasks() }));

    await session.refresh();
    expect(session.current().mutation.phase).toBe("submitting");
    expect(session.acceptTask(otherTaskId)).toBe(operation);
    transport.queueResults.push(
      Promise.resolve({
        tasks: [parkingTask({ status: "ACCEPTED", version: 3 })],
      }),
    );
    post.resolve(acceptedProjection());
    await operation;
    expect(transport.acceptCalls).toHaveLength(1);
  });

  it("destroys unresolved state immediately on clear and identity replacement", async () => {
    const { session, transport } = await unavailable();
    session.clear();
    expect(session.current()).toMatchObject({
      identityGeneration: null,
      mutation: { phase: "idle" },
      tasks: [],
    });
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(Promise.resolve({ tasks: tasks() }));
    await session.activate(2);
    transport.acceptResults.push(Promise.resolve(acceptedProjection()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [parkingTask({ status: "ACCEPTED", version: 3 })],
      }),
    );
    await session.acceptTask(ids.task);
    expect(transport.acceptCalls).toHaveLength(2);
    expect(session.current().identityGeneration).toBe(2);
  });

  it.each(["accepted", "conflict", "failed", "retry-available"] as const)(
    "allows another Task after the original reaches %s",
    async (phase) => {
      const { session, transport } = await ready();
      transport.acceptResults.push(
        Promise.reject(
          phase === "failed"
            ? new EmployeeApiError({
                code: "DENIED",
                message: "Denied",
                status: 403,
              })
            : employeeNetworkError(),
        ),
      );
      if (phase !== "failed") {
        transport.queueResults.push(
          Promise.resolve({
            tasks: [
              parkingTask(
                phase === "accepted"
                  ? { status: "ACCEPTED", version: 3 }
                  : phase === "conflict"
                    ? { version: 4 }
                    : {},
              ),
              parkingTask({ taskId: otherTaskId }),
            ],
          }),
        );
      }
      await session.acceptTask(ids.task);
      expect(session.current().mutation.phase).toBe(phase);

      transport.acceptResults.push(Promise.resolve(acceptedProjection()));
      transport.queueResults.push(
        Promise.resolve({
          tasks: [
            parkingTask({
              taskId: otherTaskId,
              status: "ACCEPTED",
              version: 3,
            }),
          ],
        }),
      );
      await session.acceptTask(otherTaskId);

      expect(transport.acceptCalls).toHaveLength(2);
      expect(transport.acceptCalls[1]?.taskId).toBe(otherTaskId);
      expect(session.current().mutation.phase).toBe("accepted");
    },
  );
});
