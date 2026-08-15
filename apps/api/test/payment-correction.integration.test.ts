import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FinancialMutationTestContext } from "./financial-mutation-test-context";

const context = new FinancialMutationTestContext("corrections");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function fixture(
  options: Parameters<typeof context.createPaymentFixture>[0] = {},
) {
  const paymentFixture = await context.createPaymentFixture({
    organizationFee: "5.000",
    organizationTips: true,
    organizationValidation: true,
    ...options,
  });
  const payment = await context.initialize(paymentFixture);
  const manager = await context.actor(paymentFixture);
  return { manager, payment, paymentFixture };
}

describe("VAL-008B guarded pre-collection corrections", () => {
  it("corrects CUSTOMER to VENUE and preserves service snapshot", async () => {
    const data = await fixture();
    await expect(
      context.payer(data.paymentFixture, data.manager, {
        servicePayer: "VENUE",
      }),
    ).resolves.toMatchObject({
      amountDue: "0.000",
      collectionMethod: "NONE",
      serviceAmount: "5.000",
      servicePayer: "VENUE",
      status: "NOT_REQUIRED",
    });
  });

  it("corrects VENUE to CUSTOMER and derives positive CASH state", async () => {
    const data = await fixture({ organizationPayer: "VENUE" });
    await expect(
      context.payer(data.paymentFixture, data.manager, {
        servicePayer: "CUSTOMER",
      }),
    ).resolves.toMatchObject({
      amountDue: "5.000",
      collectionMethod: "CASH",
      status: "UNPAID",
    });
  });

  it("includes existing pre-collection tip in payer recomputation", async () => {
    const data = await fixture();
    await context.managerTip(data.paymentFixture, data.manager, "2.000");
    await expect(
      context.payer(data.paymentFixture, data.manager, {
        servicePayer: "VENUE",
      }),
    ).resolves.toMatchObject({ amountDue: "2.000", status: "UNPAID" });
  });

  it("denies payer correction after amountPaid evidence", async () => {
    const data = await fixture();
    await context.adminPool.query(
      `UPDATE payments SET amount_paid = amount_due, status = 'PAID',
              paid_at = transaction_timestamp() WHERE id = $1`,
      [data.payment.id],
    );
    await expect(
      context.payer(data.paymentFixture, data.manager, {
        servicePayer: "VENUE",
      }),
    ).rejects.toMatchObject({ code: "COLLECTION_ALREADY_STARTED" });
  });

  it("denies payer correction when CashEntry exists", async () => {
    const data = await fixture();
    await context.addCashEvidence(data.paymentFixture, data.payment.id);
    await expect(
      context.payer(data.paymentFixture, data.manager, {
        servicePayer: "VENUE",
      }),
    ).rejects.toMatchObject({ code: "COLLECTION_ALREADY_STARTED" });
  });

  it("denies payer correction after any Validation history", async () => {
    const data = await fixture();
    await context.validation(data.paymentFixture, data.manager, {
      mode: "FULL",
    });
    await context.validation(data.paymentFixture, data.manager, {
      mode: "NONE",
    });
    await expect(
      context.payer(data.paymentFixture, data.manager, {
        servicePayer: "VENUE",
      }),
    ).rejects.toMatchObject({ code: "PRECOLLECTION_CORRECTION_NOT_ALLOWED" });
  });

  it("denies payer correction when provider/reference exists", async () => {
    const data = await fixture();
    await context.adminPool.query(
      `UPDATE payments SET collection_method = 'DIGITAL', provider = 'existing',
              provider_reference = 'reference', status = 'PENDING'
       WHERE id = $1`,
      [data.payment.id],
    );
    await expect(
      context.payer(data.paymentFixture, data.manager, {
        servicePayer: "VENUE",
      }),
    ).rejects.toMatchObject({ code: "COLLECTION_ALREADY_STARTED" });
  });

  it("corrects service amount without mutating configuration policy", async () => {
    const data = await fixture();
    const result = await context.serviceAmount(
      data.paymentFixture,
      data.manager,
      {
        serviceAmount: "7.125",
      },
    );
    expect(result).toMatchObject({
      amountDue: "7.125",
      serviceAmount: "7.125",
    });
    const policy = await context.adminPool.query(
      `SELECT valet_service_fee::text FROM organizations WHERE id = $1`,
      [data.paymentFixture.organizationId],
    );
    expect(policy.rows[0]?.valet_service_fee).toBe("5.000");
  });

  it.each(["-1", "1.0001", "abc", "100000000000.000"])(
    "denies invalid service amount %s without rounding",
    async (serviceAmount) => {
      const data = await fixture();
      await expect(
        context.serviceAmount(data.paymentFixture, data.manager, {
          serviceAmount,
        }),
      ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_INVALID" });
    },
  );

  it("denies service correction after Validation history", async () => {
    const data = await fixture();
    await context.validation(data.paymentFixture, data.manager, {
      amount: "2.000",
      mode: "PARTIAL",
    });
    await expect(
      context.serviceAmount(data.paymentFixture, data.manager, {
        serviceAmount: "8.000",
      }),
    ).rejects.toMatchObject({ code: "PRECOLLECTION_CORRECTION_NOT_ALLOWED" });
  });

  it("denies service correction after collection starts", async () => {
    const data = await fixture();
    await context.addCashEvidence(data.paymentFixture, data.payment.id);
    await expect(
      context.serviceAmount(data.paymentFixture, data.manager, {
        serviceAmount: "8.000",
      }),
    ).rejects.toMatchObject({ code: "COLLECTION_ALREADY_STARTED" });
  });

  it("fails DIGITAL_ONLY positive correction atomically", async () => {
    const data = await fixture({
      organizationFee: "0",
      organizationMethods: "DIGITAL_ONLY",
    });
    await expect(
      context.serviceAmount(data.paymentFixture, data.manager, {
        serviceAmount: "1.000",
      }),
    ).rejects.toMatchObject({ code: "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE" });
    expect(await context.payment(data.paymentFixture.sessionId)).toMatchObject({
      amount_due: "0.000",
      service_amount: "0.000",
    });
  });
});
