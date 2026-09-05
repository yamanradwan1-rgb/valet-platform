import { describe, expect, it } from "vitest";

import { EmployeeOperationalSession } from "./employee-operational-session";
import type { EmployeeOperationalTransport } from "./employee-operational-types";
import { EmployeeShiftStartSession } from "./employee-shift-start-session";
import {
  activeShiftResponse,
  StubShiftStartTransport,
} from "./employee-shift-start-test-fixture";
import {
  ids,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

describe("Employee Start Shift operational integration", () => {
  it("loads the new authoritative Shift and only then binds its task queue", async () => {
    const source = new StubOperationalTransport();
    source.contextResults.push(
      Promise.resolve(operationalContext(false)),
      Promise.resolve(operationalContext(true)),
    );
    source.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
    const shiftHolder: { session?: EmployeeShiftStartSession } = {};
    const transport: EmployeeOperationalTransport = {
      acceptTask: (taskId, expectedVersion) =>
        source.acceptTask(taskId, expectedVersion),
      assignTask: (taskId, expectedVersion) =>
        source.assignTask(taskId, expectedVersion),
      async loadOperationalContext() {
        const context = await source.loadOperationalContext();
        shiftHolder.session?.observeOperationalContext(1, context);
        return context;
      },
      loadTaskQueue: (locationId) => source.loadTaskQueue(locationId),
    };
    const operations = new EmployeeOperationalSession({ transport });
    const startTransport = new StubShiftStartTransport();
    startTransport.results.push(Promise.resolve(activeShiftResponse()));
    const shiftStart = new EmployeeShiftStartSession({
      refreshOperationalContext: () => operations.refresh(),
      transport: startTransport,
    });
    shiftHolder.session = shiftStart;
    shiftStart.activate(1);

    await operations.activate(1);

    expect(operations.current().phase).toBe("no-active-shift");
    expect(operations.current().tasks).toEqual([]);
    expect(source.queueCalls).toEqual([]);

    await shiftStart.start();

    expect(shiftStart.current().phase).toBe("active");
    expect(operations.current()).toMatchObject({
      phase: "ready",
      scope: { locationId: ids.location, shiftId: ids.shift },
    });
    expect(source.queueCalls).toEqual([ids.location]);
    expect(operations.current().tasks).toEqual([parkingTask()]);
  });
});
