import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { HandoffTestContext } from "./handoff-test-context";

const context = new HandoffTestContext("proof_concurrency");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function outcomes(results: PromiseSettledResult<unknown>[]) {
  return {
    fulfilled: results.filter((result) => result.status === "fulfilled"),
    rejected: results.filter((result) => result.status === "rejected"),
  };
}

describe("MOB-014A overlapping PostgreSQL handoff proof commands", () => {
  it("rejects stale version and replay without changing the verified result", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const material = await context.issue(fixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    await expect(
      context.verify(fixture, "PICKUP_CODE", material.pickupCode, 7),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await context.verify(fixture, "PICKUP_CODE", material.pickupCode);
    await expect(
      context.verify(fixture, "PICKUP_CODE", material.pickupCode, 9),
    ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_ALREADY_VERIFIED" });
    expect(
      (await context.handoffEffects(fixture)).projection.session_version,
    ).toBe(9);
  });

  it("uses one generic failure when current policy disallows an issued method", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const material = await context.issue(fixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    await context.adminPool.query(
      `UPDATE organizations SET handoff_standard_method_policy = 'DYNAMIC_QR' WHERE id = $1`,
      [fixture.organizationId],
    );
    await expect(
      context.verify(fixture, "PICKUP_CODE", material.pickupCode),
    ).rejects.toMatchObject({ code: "HANDOFF_VERIFICATION_FAILED" });
    const effects = await context.handoffEffects(fixture);
    expect(effects.verifications[0]?.consumed_at).not.toBeNull();
    expect(effects.projection.session_version).toBe(8);
  });

  it("serializes two-principal Standard verification to the current Task owner", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const nonOwner = await context.addMember(fixture);
    const material = await context.issue(fixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    const settled = await Promise.allSettled([
      context.verify(fixture, "PICKUP_CODE", material.pickupCode),
      context.verify(
        { ...fixture, userId: nonOwner.userId },
        "PICKUP_CODE",
        material.pickupCode,
      ),
    ]);
    expect(outcomes(settled).fulfilled).toHaveLength(1);
    expect(outcomes(settled).rejected).toHaveLength(1);
    const effects = await context.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({
      session_state: "HANDOFF_PENDING",
      session_version: 9,
      task_status: "IN_PROGRESS",
    });
    expect(
      effects.verifications.filter((row) => row.verified_at !== null),
    ).toHaveLength(1);
  });

  it("serializes verify versus abort without mixed final state", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const material = await context.issue(fixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    const settled = await Promise.allSettled([
      context.verify(fixture, "PICKUP_CODE", material.pickupCode),
      context.abort(fixture),
    ]);
    expect(outcomes(settled).fulfilled).toHaveLength(1);
    expect(outcomes(settled).rejected).toHaveLength(1);
    const effects = await context.handoffEffects(fixture);
    expect(effects.projection.session_version).toBe(9);
    expect(["READY", "HANDOFF_PENDING"]).toContain(
      effects.projection.session_state,
    );
    if (effects.projection.session_state === "READY") {
      expect(effects.verifications[0]?.consumed_at).not.toBeNull();
    } else {
      expect(effects.verifications[0]?.verified_at).not.toBeNull();
    }
  });

  it("serializes verify versus supervisor override to one verified method", async () => {
    const fixture = await context.createHandoffFixture();
    await context.initiate(fixture);
    const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
    const material = await context.issue(fixture, "PICKUP_CODE");
    if (material.method !== "PICKUP_CODE")
      throw new Error("Unexpected method.");
    const settled = await Promise.allSettled([
      context.verify(fixture, "PICKUP_CODE", material.pickupCode),
      context.overrideHandoff(fixture, supervisor.userId, 8),
    ]);
    expect(outcomes(settled).fulfilled).toHaveLength(1);
    expect(outcomes(settled).rejected).toHaveLength(1);
    const effects = await context.handoffEffects(fixture);
    expect(effects.projection).toMatchObject({
      session_state: "HANDOFF_PENDING",
      session_version: 9,
    });
    expect(
      effects.verifications.filter(
        (row) => row.verified_at !== null && row.consumed_at === null,
      ),
    ).toHaveLength(1);
  });

  it.each(["override", "abort"] as const)(
    "makes duplicate %s commands single-winner",
    async (command) => {
      const fixture = await context.createHandoffFixture();
      await context.initiate(fixture);
      const supervisor = await context.addMember(fixture, "VALET_SUPERVISOR");
      const operation = () =>
        command === "override"
          ? context.overrideHandoff(fixture, supervisor.userId, 8)
          : context.abort(fixture, supervisor.userId, 8);
      const settled = await Promise.allSettled([operation(), operation()]);
      expect(outcomes(settled).fulfilled).toHaveLength(1);
      expect(outcomes(settled).rejected).toHaveLength(1);
      expect(
        (await context.handoffEffects(fixture)).projection.session_version,
      ).toBe(9);
    },
  );
});
