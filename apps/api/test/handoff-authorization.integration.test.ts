import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HandoffTestContext } from "./handoff-test-context";

const context = new HandoffTestContext("authorization");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006F handoff authorization concealment", () => {
  it("conceals cross-tenant supervisor override", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const actor = await context.addCrossTenantSupervisor();
    await expect(
      context.overrideHandoff(fixture, actor.userId, 8),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
  });

  it("conceals wrong-Location override in the same Organization", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const actor = await context.addWrongLocationSupervisor(fixture);
    await expect(
      context.overrideHandoff(fixture, actor.userId, 8),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
  });

  it("conceals wrong-Location abort in the same Organization", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const actor = await context.addWrongLocationSupervisor(fixture);
    await expect(context.abort(fixture, actor.userId)).rejects.toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
    });
  });

  it("conceals a supervisor without active operational eligibility", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const actor = await context.addMember(fixture, "VALET_SUPERVISOR", false);
    await expect(
      context.overrideHandoff(fixture, actor.userId, 8),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
  });

  it("allows an eligible same-Location supervisor to override", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const actor = await context.addMember(fixture, "VALET_SUPERVISOR");
    await expect(
      context.overrideHandoff(fixture, actor.userId, 8),
    ).resolves.toMatchObject({
      method: "SUPERVISOR_OVERRIDE",
      sessionVersion: 9,
    });
  });

  it("denies supervisor override to an eligible ordinary employee", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const actor = await context.addMember(fixture);
    await expect(
      context.overrideHandoff(fixture, actor.userId, 8),
    ).rejects.toMatchObject({ code: "HANDOFF_OVERRIDE_NOT_ALLOWED" });
  });

  it("denies abort to an eligible non-owner employee", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const actor = await context.addMember(fixture);
    await expect(context.abort(fixture, actor.userId)).rejects.toMatchObject({
      code: "HANDOFF_OVERRIDE_NOT_ALLOWED",
    });
    expect(
      (await context.handoffEffects(fixture)).projection.session_state,
    ).toBe("HANDOFF_PENDING");
  });
});
