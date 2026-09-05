import { describe, expect, it } from "vitest";

import { employeeNetworkError } from "./api-error";
import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  acceptedProjection,
  deferred,
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

type CanonicalPhase = "accepted" | "conflict" | "retry-available";

function canonicalTask(phase: CanonicalPhase) {
  if (phase === "accepted") {
    return parkingTask({ status: "ACCEPTED", version: 3 });
  }
  if (phase === "retry-available") return parkingTask();
  return parkingTask({
    currentAssigneeMembershipId: "99999999-9999-4999-8999-999999999999",
    status: "ASSIGNED",
    version: 3,
  });
}

async function recoverAfterTemporaryContextFailure(phase: CanonicalPhase) {
  const post = deferred<ReturnType<typeof acceptedProjection>>();
  const transport = new StubOperationalTransport();
  transport.contextResults.push(
    Promise.resolve(operationalContext()),
    Promise.reject(employeeNetworkError()),
    Promise.resolve(operationalContext()),
  );
  transport.queueResults.push(
    Promise.resolve({ tasks: [parkingTask()] }),
    Promise.resolve({ tasks: [canonicalTask(phase)] }),
  );
  transport.acceptResults.push(post.promise);
  const session = new EmployeeOperationalSession({ transport });
  await session.activate(1);

  const action = session.acceptTask(ids.task);
  await session.refresh();
  post.resolve(acceptedProjection());
  await action;

  expect(session.current()).toMatchObject({
    mutation: { phase: "reconciling" },
    phase: "error",
  });
  expect(transport.acceptCalls).toHaveLength(1);
  await session.refresh();
  expect(session.current().successfulQueueSnapshotCount).toBe(2);

  return { action, session, transport };
}

describe("Employee action recovery after temporary context failure", () => {
  it.each<CanonicalPhase>(["accepted", "retry-available", "conflict"])(
    "reconciles the completed POST to %s without replay",
    async (phase) => {
      const { session, transport } =
        await recoverAfterTemporaryContextFailure(phase);

      expect(session.current().mutation.phase).toBe(phase);
      expect(transport.acceptCalls).toHaveLength(1);
    },
  );

  it("releases the completed operation after recovery for an explicit retry", async () => {
    const { action, session, transport } =
      await recoverAfterTemporaryContextFailure("retry-available");
    transport.acceptResults.push(Promise.resolve(acceptedProjection()));
    transport.queueResults.push(
      Promise.resolve({
        tasks: [parkingTask({ status: "ACCEPTED", version: 3 })],
      }),
    );

    const retry = session.acceptTask(ids.task);

    expect(retry).not.toBe(action);
    await retry;
    expect(transport.acceptCalls).toHaveLength(2);
    expect(session.current().mutation.phase).toBe("accepted");
  });

  it.each(["Location", "Shift", "generation"] as const)(
    "purges the retained mutation when %s authority changes",
    async (change) => {
      const post = deferred<ReturnType<typeof acceptedProjection>>();
      const nextId = "99999999-9999-4999-8999-999999999999";
      const replacement = operationalContext();
      const changed = {
        contexts: replacement.contexts.map((context) => ({
          ...context,
          activeShift:
            context.activeShift === null
              ? null
              : {
                  ...context.activeShift,
                  ...(change === "Location" ? { locationId: nextId } : {}),
                  ...(change === "Shift" ? { shiftId: nextId } : {}),
                },
          currentLocation:
            context.currentLocation === null
              ? null
              : {
                  ...context.currentLocation,
                  ...(change === "Location" ? { locationId: nextId } : {}),
                },
        })),
      };
      const transport = new StubOperationalTransport();
      transport.contextResults.push(
        Promise.resolve(operationalContext()),
        Promise.reject(employeeNetworkError()),
        Promise.resolve(changed),
      );
      transport.queueResults.push(
        Promise.resolve({ tasks: [parkingTask()] }),
        Promise.resolve({ tasks: [] }),
      );
      transport.acceptResults.push(post.promise);
      const session = new EmployeeOperationalSession({ transport });
      await session.activate(1);

      const action = session.acceptTask(ids.task);
      await session.refresh();
      post.resolve(acceptedProjection());
      await action;
      await (change === "generation" ? session.activate(2) : session.refresh());

      expect(session.current()).toMatchObject({
        mutation: { phase: "idle" },
        tasks: [],
      });
      expect(transport.acceptCalls).toHaveLength(1);
    },
  );
});
