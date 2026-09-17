import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("authorization");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-006G final release authority", () => {
  it("allows the ordinary current employee Task owner", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await expect(context.complete(fixture)).resolves.toMatchObject({
      state: "COMPLETED",
    });
  });

  it("allows the eligible current Task owner when that owner is a supervisor", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.adminPool.query(
      `UPDATE organization_memberships
       SET role = 'VALET_SUPERVISOR', updated_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.membershipId],
    );
    await expect(context.complete(fixture)).resolves.toMatchObject({
      state: "COMPLETED",
    });
  });

  it("conceals an eligible same-Location non-owner employee", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const actor = await context.addMember(fixture);
    await expect(context.complete(fixture, actor.userId)).rejects.toMatchObject(
      { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
    );
  });

  it("does not let the supervisor who created an override release as non-owner", async () => {
    const { fixture, supervisor } = await context.prepareOverride();
    await expect(
      context.complete(fixture, supervisor.userId),
    ).rejects.toMatchObject({ code: "TASK_NOT_FOUND_OR_FORBIDDEN" });
    expect(
      (await context.releaseEffects(fixture)).projection.session_state,
    ).toBe("HANDOFF_PENDING");
  });

  it("conceals a wrong-Location same-Organization actor", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const actor = await context.addWrongLocationSupervisor(fixture);
    await expect(context.complete(fixture, actor.userId)).rejects.toMatchObject(
      { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
    );
  });

  it("conceals a cross-tenant actor", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    const actor = await context.addCrossTenantSupervisor();
    await expect(context.complete(fixture, actor.userId)).rejects.toMatchObject(
      { code: "TASK_NOT_FOUND_OR_FORBIDDEN" },
    );
  });

  it.each([
    [
      "inactive Shift",
      `UPDATE shifts SET status = 'ENDED', ended_at = transaction_timestamp()
       WHERE membership_id = $1 AND status = 'ACTIVE'`,
      "membershipId",
    ],
    [
      "inactive membership",
      `UPDATE organization_memberships SET status = 'INACTIVE',
         updated_at = transaction_timestamp() WHERE id = $1`,
      "membershipId",
    ],
    [
      "inactive User",
      `UPDATE users SET status = 'DISABLED', updated_at = transaction_timestamp()
       WHERE id = $1`,
      "userId",
    ],
    [
      "inactive Organization",
      `UPDATE organizations SET status = 'INACTIVE',
         updated_at = transaction_timestamp() WHERE id = $1`,
      "organizationId",
    ],
    [
      "inactive Location",
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE,
         updated_at = transaction_timestamp() WHERE id = $1`,
      "locationId",
    ],
  ] as const)("fails safely for %s", async (_label, sql, idField) => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.adminPool.query(sql, [fixture[idField]]);
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "TASK_NOT_FOUND_OR_FORBIDDEN",
    });
    expect(
      (await context.releaseEffects(fixture)).projection.session_state,
    ).toBe("HANDOFF_PENDING");
  });
});
