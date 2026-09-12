import { describe, expect, it } from "vitest";
import { EmployeeOperationalSession } from "./employee-operational-session";
import {
  deferred,
  operationalContext,
  parkingTask,
  StubOperationalTransport,
} from "./employee-operational-test-fixture";

describe("Employee operational lifecycle races", () => {
  it("does not publish a slow context response after background", async () => {
    const first = deferred<ReturnType<typeof operationalContext>>();
    const transport = new StubOperationalTransport();
    transport.contextResults.push(first.promise);
    const session = new EmployeeOperationalSession({
      initialForeground: true,
      transport,
    });
    const activation = session.activate(1);
    await session.setForeground(false);
    first.resolve(operationalContext());
    await activation;
    expect(session.current().phase).toBe("loading-context");
    expect(transport.queueCalls).toHaveLength(0);

    transport.contextResults.push(Promise.resolve(operationalContext()));
    transport.queueResults.push(Promise.resolve({ tasks: [parkingTask()] }));
    await session.setForeground(true);
    expect(session.current()).toMatchObject({ phase: "ready" });
    expect(session.current().tasks).toHaveLength(1);
  });
});
