import { describe, expect, it } from "vitest";

import { EmployeeApiError } from "./api-error";
import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  deferred,
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

describe("Employee operational context and queue", () => {
  it("loads authoritative context and the selected Location queue", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
    const session = new EmployeeOperationalSession({ transport });

    await session.activate(7);

    expect(session.current()).toMatchObject({
      identityGeneration: 7,
      phase: "ready",
      scope: {
        locationId: ids.location,
        membershipId: ids.membership,
        organizationName: "VAYLET Operator",
        role: "VALET_EMPLOYEE",
      },
    });
    expect(transport.queueCalls).toEqual([ids.location]);
    expect(session.current().tasks).toHaveLength(1);
  });

  it("reports no active Shift without loading a queue", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext(false)));
    const session = new EmployeeOperationalSession({ transport });

    await session.activate(1);

    expect(session.current().phase).toBe("no-active-shift");
    expect(transport.queueCalls).toEqual([]);
  });

  it("projects the authoritative ambiguous active Shift count for display", async () => {
    const transport = new StubOperationalTransport();
    const context = operationalContext();
    transport.contextResults.push(
      Promise.resolve({ contexts: [...context.contexts, ...context.contexts] }),
    );
    const session = new EmployeeOperationalSession({ transport });

    await session.activate(1);

    expect(session.current()).toMatchObject({
      activeShiftCount: 2,
      phase: "ambiguous-active-shifts",
    });
    expect(transport.queueCalls).toEqual([]);
  });

  it("distinguishes no usable Location from no active Shift", async () => {
    const transport = new StubOperationalTransport();
    const context = operationalContext(false);
    transport.contextResults.push(
      Promise.resolve({
        contexts: context.contexts.map((membership) => ({
          ...membership,
          eligibleLocations: [],
        })),
      }),
    );
    const session = new EmployeeOperationalSession({ transport });

    await session.activate(1);

    expect(session.current().phase).toBe("no-usable-location");
    expect(transport.queueCalls).toEqual([]);
  });

  it("fails closed when an authenticated response has no usable membership", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve({ contexts: [] }));
    const session = new EmployeeOperationalSession({ transport });

    await session.activate(1);

    expect(session.current().phase).toBe("access-denied");
    expect(transport.queueCalls).toEqual([]);
  });

  it("keeps context load failure truthful", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.reject(
        new EmployeeApiError({
          code: "AUTHORIZATION_DENIED",
          message: "Denied",
          status: 404,
        }),
      ),
    );
    const session = new EmployeeOperationalSession({ transport });

    await session.activate(2);

    expect(session.current()).toMatchObject({
      contextFailure: { code: "AUTHORIZATION_DENIED" },
      phase: "error",
      tasks: [],
    });
  });

  it("keeps both Parking and Retrieval work in the production queue", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [
          parkingTask(),
          parkingTask({
            taskId: "77777777-7777-4777-8777-777777777777",
            taskType: "RETRIEVAL",
          }),
        ],
      }),
    );
    const session = new EmployeeOperationalSession({ transport });

    await session.activate(3);

    expect(session.current().tasks.map((task) => task.taskType)).toEqual([
      "PARKING",
      "RETRIEVAL",
    ]);
  });

  it("coalesces refresh with an in-flight read instead of overlapping it", async () => {
    const first = deferred<{ tasks: ReturnType<typeof parkingTask>[] }>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(first.promise);
    const session = new EmployeeOperationalSession({ transport });

    const activation = session.activate(4);
    await Promise.resolve();
    await Promise.resolve();
    const refresh = session.refreshQueue();
    expect(transport.queueCalls).toEqual([ids.location]);
    first.resolve({ tasks: [parkingTask({ version: 8 })] });
    await Promise.all([activation, refresh]);

    expect(session.current().tasks[0]?.version).toBe(8);
  });
});
