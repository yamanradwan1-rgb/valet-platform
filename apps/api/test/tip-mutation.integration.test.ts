import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FinancialMutationTestContext } from "./financial-mutation-test-context";

const context = new FinancialMutationTestContext("tips");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function fixture(
  options: Parameters<typeof context.createPaymentFixture>[0] = {},
) {
  const paymentFixture = await context.createPaymentFixture({
    organizationFee: "5.000",
    organizationTips: true,
    ...options,
  });
  const payment = await context.initialize(paymentFixture);
  const manager = await context.actor(paymentFixture);
  const token = await context.guestToken(paymentFixture);
  return { manager, payment, paymentFixture, token };
}

describe("VAL-008B tip mutation", () => {
  it("denies Guest tip when tips are disabled", async () => {
    const data = await fixture({ organizationTips: false });
    await expect(context.guestTip(data.token, "2.000")).rejects.toMatchObject({
      code: "PAYMENT_TIPS_DISABLED",
    });
  });

  it("denies Manager tip when tips are disabled", async () => {
    const data = await fixture({ organizationTips: false });
    await expect(
      context.managerTip(data.paymentFixture, data.manager, "2.000"),
    ).rejects.toMatchObject({ code: "PAYMENT_TIPS_DISABLED" });
  });

  it("allows an authenticated Guest to set their own tip", async () => {
    const data = await fixture();
    await expect(context.guestTip(data.token, "2.125")).resolves.toMatchObject({
      amountDue: "7.125",
      tipAmount: "2.125",
    });
  });

  it("never lets one Guest token choose or mutate another session", async () => {
    const first = await fixture();
    const second = await fixture();
    await context.guestTip(first.token, "3.000");
    expect(await context.payment(first.paymentFixture.sessionId)).toMatchObject(
      {
        tip_amount: "3.000",
      },
    );
    expect(
      await context.payment(second.paymentFixture.sessionId),
    ).toMatchObject({
      tip_amount: "0.000",
    });
  });

  it("allows exact-Location Manager tip correction", async () => {
    const data = await fixture();
    await expect(
      context.managerTip(data.paymentFixture, data.manager, "1.500"),
    ).resolves.toMatchObject({ amountDue: "6.500", tipAmount: "1.500" });
  });

  it("allows setting tip back to zero pre-collection", async () => {
    const data = await fixture();
    await context.managerTip(data.paymentFixture, data.manager, "1.000");
    await expect(
      context.managerTip(data.paymentFixture, data.manager, "0"),
    ).resolves.toMatchObject({ amountDue: "5.000", tipAmount: "0.000" });
  });

  it("recomputes FULL-validation plus tip and zero-to-positive state", async () => {
    const data = await fixture({ organizationValidation: true });
    await context.validation(data.paymentFixture, data.manager, {
      mode: "FULL",
    });
    const result = await context.guestTip(data.token, "2.000");
    expect(result).toMatchObject({
      amountDue: "2.000",
      collectionMethod: "CASH",
      status: "UNPAID",
    });
  });

  it("rolls tip back when positive recomputation is DIGITAL_ONLY", async () => {
    const data = await fixture({
      organizationFee: "0",
      organizationMethods: "DIGITAL_ONLY",
    });
    await expect(context.guestTip(data.token, "1.000")).rejects.toMatchObject({
      code: "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE",
    });
    expect(await context.payment(data.paymentFixture.sessionId)).toMatchObject({
      amount_due: "0.000",
      tip_amount: "0.000",
    });
  });

  it("denies tip after paid/amountPaid collection evidence", async () => {
    const data = await fixture();
    await context.adminPool.query(
      `UPDATE payments SET amount_paid = amount_due, status = 'PAID',
              paid_at = transaction_timestamp()
       WHERE id = $1`,
      [data.payment.id],
    );
    await expect(context.guestTip(data.token, "1.000")).rejects.toMatchObject({
      code: "COLLECTION_ALREADY_STARTED",
    });
  });

  it("denies tip when any CashEntry exists", async () => {
    const data = await fixture();
    await context.addCashEvidence(data.paymentFixture, data.payment.id);
    await expect(
      context.managerTip(data.paymentFixture, data.manager, "1.000"),
    ).rejects.toMatchObject({ code: "COLLECTION_ALREADY_STARTED" });
  });

  it("denies tip when provider evidence exists", async () => {
    const data = await fixture();
    await context.adminPool.query(
      `UPDATE payments SET collection_method = 'DIGITAL', provider = 'existing',
              status = 'UNPAID' WHERE id = $1`,
      [data.payment.id],
    );
    await expect(
      context.managerTip(data.paymentFixture, data.manager, "1.000"),
    ).rejects.toMatchObject({ code: "COLLECTION_ALREADY_STARTED" });
  });

  it("audits Guest with null staff actor and safe actor class", async () => {
    const data = await fixture();
    await context.guestTip(data.token, "1.000");
    const audits = await context.financialAudits(data.paymentFixture.sessionId);
    expect(audits).toContainEqual(
      expect.objectContaining({
        actor_membership_id: null,
        event_type: "PAYMENT_TIP_UPDATED",
        metadata_json: expect.objectContaining({ actor_class: "GUEST" }),
      }),
    );
    expect(JSON.stringify(audits)).not.toMatch(/token|authorization|password/i);
  });
});
