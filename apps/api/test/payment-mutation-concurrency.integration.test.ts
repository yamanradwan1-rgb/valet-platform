import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FinancialMutationTestContext } from "./financial-mutation-test-context";

const context = new FinancialMutationTestContext("mutation-concurrency");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function fixture() {
  const paymentFixture = await context.createPaymentFixture({
    organizationFee: "10.000",
    organizationTips: true,
    organizationValidation: true,
  });
  const payment = await context.initialize(paymentFixture);
  const manager = await context.actor(paymentFixture);
  return { manager, payment, paymentFixture };
}

describe("VAL-008B mixed financial mutation concurrency", () => {
  it("serializes Validation against payer correction coherently", async () => {
    const data = await fixture();
    const settled = await Promise.allSettled([
      context.validation(data.paymentFixture, data.manager, { mode: "FULL" }),
      context.payer(data.paymentFixture, data.manager, {
        servicePayer: "VENUE",
      }),
    ]);
    expect(
      settled.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const payment = await context.payment(data.paymentFixture.sessionId);
    const validations = await context.validations(data.payment.id);
    if (payment.service_payer === "VENUE") {
      expect(validations).toEqual([]);
      expect(payment.amount_due).toBe("0.000");
    } else {
      expect(validations.filter((row) => row.is_current)).toHaveLength(1);
      expect(payment.amount_due).toBe("0.000");
    }
  });

  it("serializes Validation against service correction without ambiguity", async () => {
    const data = await fixture();
    const settled = await Promise.allSettled([
      context.validation(data.paymentFixture, data.manager, {
        amount: "4.000",
        mode: "PARTIAL",
      }),
      context.serviceAmount(data.paymentFixture, data.manager, {
        serviceAmount: "12.000",
      }),
    ]);
    const successCount = settled.filter(
      (result) => result.status === "fulfilled",
    ).length;
    expect([1, 2]).toContain(successCount);
    const payment = await context.payment(data.paymentFixture.sessionId);
    const validations = await context.validations(data.payment.id);
    expect(validations).toHaveLength(1);
    expect(validations[0]).toMatchObject({
      amount: "4.000",
      is_current: true,
      mode: "PARTIAL",
    });
    expect(["10.000", "12.000"]).toContain(payment.service_amount);
    expect(payment.amount_due).toBe(
      payment.service_amount === "10.000" ? "6.000" : "8.000",
    );
    expect(
      await context.financialAudits(data.paymentFixture.sessionId),
    ).toHaveLength(1 + successCount);
  });

  it("serializes Guest and Manager tips with one coherent final projection", async () => {
    const data = await fixture();
    const token = await context.guestToken(data.paymentFixture);
    await Promise.all([
      context.guestTip(token, "1.000"),
      context.managerTip(data.paymentFixture, data.manager, "2.000"),
    ]);
    const payment = await context.payment(data.paymentFixture.sessionId);
    expect(["1.000", "2.000"]).toContain(payment.tip_amount);
    expect(payment.amount_due).toBe(
      payment.tip_amount === "1.000" ? "11.000" : "12.000",
    );
  });
});
