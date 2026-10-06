import { describe, expect, it } from "vitest";

import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

describe("Employee operational bootstrap ordering", () => {
  it("loads the first queue snapshot when foreground ownership arrives before activation", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
    const session = new EmployeeOperationalSession({
      initialForeground: false,
      transport,
    });

    await session.setForeground(true);
    expect(transport.queueCalls).toHaveLength(0);
    await session.activate(1);

    expect(transport.queueCalls).toHaveLength(1);
    expect(session.current()).toMatchObject({
      phase: "ready",
      successfulQueueSnapshotCount: 1,
      tasks: [{ taskId: parkingTask().taskId }],
    });
  });

  it("loads the first queue snapshot when activation resolves before foreground ownership", async () => {
    const transport = new StubOperationalTransport();
    transport.contextResults.push(
      Promise.resolve(operationalContext()),
      Promise.resolve(operationalContext()),
    );
    transport.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
    const session = new EmployeeOperationalSession({
      initialForeground: false,
      transport,
    });

    await session.activate(1);
    expect(transport.queueCalls).toHaveLength(0);
    await session.setForeground(true);

    expect(transport.queueCalls).toHaveLength(1);
    expect(session.current()).toMatchObject({
      phase: "ready",
      successfulQueueSnapshotCount: 1,
      tasks: [{ taskId: parkingTask().taskId }],
    });
  });
});
