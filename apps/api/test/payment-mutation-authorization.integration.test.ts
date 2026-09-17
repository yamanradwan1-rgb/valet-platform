import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FinancialMutationTestContext } from "./financial-mutation-test-context";

const context = new FinancialMutationTestContext("authorization");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function fixture() {
  const paymentFixture = await context.createPaymentFixture({
    organizationFee: "5.000",
    organizationTips: true,
    organizationValidation: true,
  });
  const payment = await context.initialize(paymentFixture);
  return { payment, paymentFixture };
}

describe("VAL-008B financial mutation authorization and isolation", () => {
  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR", "ORG_ADMIN"] as const)(
    "denies %s payer correction authority",
    async (role) => {
      const data = await fixture();
      const actor = await context.actor(data.paymentFixture, role);
      await expect(
        context.payer(data.paymentFixture, actor, { servicePayer: "VENUE" }),
      ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    },
  );

  it("denies inactive User", async () => {
    const data = await fixture();
    const actor = await context.actor(data.paymentFixture, "LOCATION_MANAGER", {
      userStatus: "DISABLED",
    });
    await expect(
      context.managerTip(data.paymentFixture, actor, "1.000"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies inactive membership", async () => {
    const data = await fixture();
    const actor = await context.actor(data.paymentFixture, "LOCATION_MANAGER", {
      membershipStatus: "INACTIVE",
    });
    await expect(
      context.managerTip(data.paymentFixture, actor, "1.000"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies inactive Organization", async () => {
    const data = await fixture();
    const actor = await context.actor(data.paymentFixture);
    await context.adminPool.query(
      `UPDATE organizations SET status = 'INACTIVE' WHERE id = $1`,
      [data.paymentFixture.organizationId],
    );
    await expect(
      context.managerTip(data.paymentFixture, actor, "1.000"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies inactive Location", async () => {
    const data = await fixture();
    const actor = await context.actor(data.paymentFixture);
    await context.adminPool.query(
      `UPDATE locations SET status = 'INACTIVE', accepting_intake = FALSE WHERE id = $1`,
      [data.paymentFixture.locationId],
    );
    await expect(
      context.managerTip(data.paymentFixture, actor, "1.000"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("denies Manager without explicit Location access", async () => {
    const data = await fixture();
    const actor = await context.actor(data.paymentFixture, "LOCATION_MANAGER", {
      locationAccess: false,
    });
    await expect(
      context.managerTip(data.paymentFixture, actor, "1.000"),
    ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("conceals cross-tenant session probing", async () => {
    const first = await fixture();
    const second = await fixture();
    const actor = await context.actor(first.paymentFixture);
    await expect(
      context.managerTip(second.paymentFixture, actor, "1.000"),
    ).rejects.toMatchObject({
      code: "AUTHORIZATION_DENIED",
      message: "The requested resource is not available.",
    });
  });

  it("requires canonical Payment rather than creating through mutation", async () => {
    const paymentFixture = await context.createPaymentFixture({
      organizationTips: true,
    });
    const actor = await context.actor(paymentFixture);
    await expect(
      context.managerTip(paymentFixture, actor, "1.000"),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_AVAILABLE" });
    expect((await context.effects(paymentFixture.sessionId)).payments).toEqual(
      [],
    );
  });

  it("does not mutate ValetSession or create later-slice financial rows", async () => {
    const data = await fixture();
    const actor = await context.actor(data.paymentFixture);
    const before = await context.sessionSnapshot(data.paymentFixture.sessionId);
    await context.managerTip(data.paymentFixture, actor, "1.000");
    expect(
      await context.sessionSnapshot(data.paymentFixture.sessionId),
    ).toEqual(before);
    expect(await context.effects(data.paymentFixture.sessionId)).toMatchObject({
      counts: {
        cash_count: 0,
        provider_event_count: 0,
        refund_count: 0,
      },
    });
  });
});
