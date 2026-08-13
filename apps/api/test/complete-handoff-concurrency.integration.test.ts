import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("concurrency");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006G completion concurrency", () => {
  it("allows at most one concurrent final release winner", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const results = await Promise.allSettled([
      context.complete(fixture),
      context.complete(fixture),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const effects = await context.releaseEffects(fixture);
    expect(effects.projection).toMatchObject({
      request_status: "COMPLETED",
      session_state: "COMPLETED",
      task_status: "COMPLETED",
    });
    expect(
      effects.custody.filter((event) => event.event_type === "RELEASED"),
    ).toHaveLength(1);
    expect(
      effects.dispatch.filter((event) => event.event_type === "COMPLETED"),
    ).toHaveLength(1);
    expect(effects.audits).toHaveLength(2);
  });

  it("serializes final release against abort with one coherent winner", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const results = await Promise.allSettled([
      context.complete(fixture),
      context.abort(fixture, fixture.userId, 9),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const effects = await context.releaseEffects(fixture);
    if (effects.projection.session_state === "COMPLETED") {
      expect(effects.projection).toMatchObject({
        request_status: "COMPLETED",
        task_status: "COMPLETED",
      });
      expect(
        effects.custody.filter((event) => event.event_type === "RELEASED"),
      ).toHaveLength(1);
      expect(effects.audits).toHaveLength(2);
    } else {
      expect(effects.projection).toMatchObject({
        request_status: "ACCEPTED",
        session_state: "READY",
        task_status: "IN_PROGRESS",
      });
      expect(
        effects.custody.filter((event) => event.event_type === "RELEASED"),
      ).toHaveLength(0);
      expect(effects.audits).toHaveLength(0);
    }
  });
});
