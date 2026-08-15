import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FinancialMutationTestContext } from "./financial-mutation-test-context";

const context = new FinancialMutationTestContext("validation");
beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function fixture(
  options: Parameters<typeof context.createPaymentFixture>[0] = {},
) {
  const paymentFixture = await context.createPaymentFixture({
    organizationFee: "10.000",
    organizationValidation: true,
    ...options,
  });
  const payment = await context.initialize(paymentFixture);
  const manager = await context.actor(paymentFixture);
  return { manager, payment, paymentFixture };
}

describe("VAL-008B Validation mutation", () => {
  it("denies Validation when effective policy is disabled with no write", async () => {
    const data = await fixture({ organizationValidation: false });
    await expect(
      context.validation(data.paymentFixture, data.manager, { mode: "FULL" }),
    ).rejects.toMatchObject({ code: "PAYMENT_VALIDATION_DISABLED" });
    expect(await context.validations(data.payment.id)).toEqual([]);
  });

  it("denies Validation for VENUE responsibility", async () => {
    const data = await fixture({ organizationPayer: "VENUE" });
    await expect(
      context.validation(data.paymentFixture, data.manager, { mode: "FULL" }),
    ).rejects.toMatchObject({ code: "PAYMENT_VALIDATION_NOT_ALLOWED" });
  });

  it("derives FULL amount from canonical serviceAmount", async () => {
    const data = await fixture();
    const result = await context.validation(data.paymentFixture, data.manager, {
      mode: "FULL",
    });
    expect(result).toMatchObject({
      amountDue: "0.000",
      collectionMethod: "NONE",
      currentValidation: { amount: "10.000", mode: "FULL" },
      status: "NOT_REQUIRED",
    });
  });

  it("applies a valid PARTIAL and recomputes customer service due", async () => {
    const data = await fixture();
    const result = await context.validation(data.paymentFixture, data.manager, {
      amount: "4.000",
      mode: "PARTIAL",
    });
    expect(result).toMatchObject({
      amountDue: "6.000",
      currentValidation: { amount: "4.000", mode: "PARTIAL" },
    });
  });

  it.each(["0", "10.000", "11.000"])(
    "denies invalid PARTIAL amount %s",
    async (amount) => {
      const data = await fixture();
      await expect(
        context.validation(data.paymentFixture, data.manager, {
          amount,
          mode: "PARTIAL",
        }),
      ).rejects.toMatchObject({ code: "PAYMENT_VALIDATION_INVALID" });
    },
  );

  it("denies NONE without prior Validation", async () => {
    const data = await fixture();
    await expect(
      context.validation(data.paymentFixture, data.manager, { mode: "NONE" }),
    ).rejects.toMatchObject({ code: "PAYMENT_VALIDATION_INVALID" });
  });

  it("supersedes FULL with PARTIAL while retaining immutable history", async () => {
    const data = await fixture();
    const first = await context.validation(data.paymentFixture, data.manager, {
      mode: "FULL",
    });
    const second = await context.validation(data.paymentFixture, data.manager, {
      amount: "3.000",
      mode: "PARTIAL",
    });
    expect(await context.validations(data.payment.id)).toEqual([
      expect.objectContaining({
        id: first.currentValidation?.id,
        is_current: false,
        mode: "FULL",
      }),
      expect.objectContaining({
        id: second.currentValidation?.id,
        is_current: true,
        mode: "PARTIAL",
        supersedes_validation_id: first.currentValidation?.id,
      }),
    ]);
  });

  it("removes Validation through a superseding NONE row", async () => {
    const data = await fixture();
    await context.validation(data.paymentFixture, data.manager, {
      mode: "FULL",
    });
    const result = await context.validation(data.paymentFixture, data.manager, {
      mode: "NONE",
    });
    expect(result).toMatchObject({
      amountDue: "10.000",
      currentValidation: { amount: "0.000", mode: "NONE" },
      status: "UNPAID",
    });
    expect((await context.validations(data.payment.id)).at(-1)).toMatchObject({
      amount: "0.000",
      is_current: true,
      mode: "NONE",
    });
  });

  it("returns an identical retry without duplicate history or audit", async () => {
    const data = await fixture();
    const first = await context.validation(data.paymentFixture, data.manager, {
      amount: "2.000",
      mode: "PARTIAL",
    });
    const second = await context.validation(data.paymentFixture, data.manager, {
      amount: "2.000",
      mode: "PARTIAL",
    });
    expect(second.currentValidation?.id).toBe(first.currentValidation?.id);
    expect(await context.validations(data.payment.id)).toHaveLength(1);
  });

  it("serializes concurrent Validation applications to one current row", async () => {
    const data = await fixture();
    await Promise.all([
      context.validation(data.paymentFixture, data.manager, {
        amount: "2.000",
        mode: "PARTIAL",
      }),
      context.validation(data.paymentFixture, data.manager, {
        amount: "4.000",
        mode: "PARTIAL",
      }),
    ]);
    const rows = await context.validations(data.payment.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.is_current)).toHaveLength(1);
  });

  it("rolls Validation and Payment back when AuditEvent insertion fails", async () => {
    const data = await fixture();
    await context.adminPool.query(
      `CREATE FUNCTION reject_validation_audit() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN IF NEW.event_type LIKE 'VALIDATION_%' THEN RAISE EXCEPTION 'injected'; END IF;
       RETURN NEW; END $$;
       CREATE TRIGGER reject_validation_audit_trigger BEFORE INSERT ON audit_events
       FOR EACH ROW EXECUTE FUNCTION reject_validation_audit()`,
    );
    try {
      await expect(
        context.validation(data.paymentFixture, data.manager, { mode: "FULL" }),
      ).rejects.toBeInstanceOf(Error);
    } finally {
      await context.adminPool.query(
        `DROP TRIGGER reject_validation_audit_trigger ON audit_events;
         DROP FUNCTION reject_validation_audit()`,
      );
    }
    expect(await context.validations(data.payment.id)).toEqual([]);
    expect(await context.payment(data.paymentFixture.sessionId)).toMatchObject({
      amount_due: "10.000",
      status: "UNPAID",
    });
  });
});
