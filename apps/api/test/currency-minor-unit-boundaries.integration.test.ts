import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CashTestContext } from "./cash-test-context";

const context = new CashTestContext("currency_minor_units");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("DEC-053 Phase 6 monetary input boundaries", () => {
  it("initializes exact JOD mills and USD cents/trailing zero", async () => {
    const jod = await context.createPaymentFixture({
      currency: "JOD",
      organizationFee: "6.125",
    });
    await expect(context.initialize(jod)).resolves.toMatchObject({
      currency: "JOD",
      serviceAmount: "6.125",
    });

    for (const fee of ["1.20", "1.200"]) {
      const usd = await context.createPaymentFixture({
        currency: "USD",
        organizationFee: fee,
      });
      await expect(context.initialize(usd)).resolves.toMatchObject({
        currency: "USD",
        serviceAmount: "1.200",
      });
    }
  });

  it.each([
    ["USD", "1.201"],
    ["ZZZ", "1.000"],
    ["XAU", "1.000"],
    ["CLF", "1.000"],
  ])(
    "fails Payment initialization atomically for %s amount %s",
    async (currency, organizationFee) => {
      const fixture = await context.createPaymentFixture({
        currency,
        organizationFee,
      });
      await expect(context.initialize(fixture)).rejects.toMatchObject({
        code: "PAYMENT_INITIALIZATION_INVALID",
      });
      expect(await context.effects(fixture.sessionId)).toMatchObject({
        counts: {
          audit_count: 0,
          cash_count: 0,
          validation_count: 0,
        },
        payments: [],
      });
    },
  );

  it("rejects over-precise Validation, Manager/Guest tip, and service correction", async () => {
    const fixture = await context.createPaymentFixture({
      currency: "USD",
      organizationFee: "10.00",
      organizationTips: true,
      organizationValidation: true,
    });
    const initialized = await context.initialize(fixture);
    const manager = await context.actor(fixture);
    const guestToken = await context.guestToken(fixture);
    const before = await context.payment(fixture.sessionId);
    const auditsBefore = await context.financialAudits(fixture.sessionId);

    await expect(
      context.validation(fixture, manager, {
        amount: "1.201",
        mode: "PARTIAL",
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_INVALID" });
    await expect(
      context.managerTip(fixture, manager, "1.201"),
    ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_INVALID" });
    await expect(
      context.guestTip(guestToken, "1.201"),
    ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_INVALID" });
    await expect(
      context.serviceAmount(fixture, manager, { serviceAmount: "8.201" }),
    ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_INVALID" });

    expect(await context.payment(fixture.sessionId)).toEqual(before);
    expect(await context.validations(initialized.id)).toEqual([]);
    expect(await context.financialAudits(fixture.sessionId)).toEqual(
      auditsBefore,
    );
  });

  it("accepts USD trailing-zero tip without changing its value", async () => {
    const fixture = await context.createPaymentFixture({
      currency: "USD",
      organizationFee: "10.00",
      organizationTips: true,
    });
    await context.initialize(fixture);
    const manager = await context.actor(fixture);
    await expect(
      context.managerTip(fixture, manager, "1.200"),
    ).resolves.toMatchObject({ amountDue: "11.200", tipAmount: "1.200" });
  });

  it("rejects over-precise cash adjustment before CashEntry, Payment, or audit writes", async () => {
    const fixture = await context.createPaymentFixture({
      currency: "USD",
      organizationFee: "10.00",
    });
    await context.initialize(fixture);
    const manager = await context.actor(fixture);
    await context.receipt(fixture, manager, randomUUID());
    const before = await context.cashEffects(fixture);

    await expect(
      context.adjustment(fixture, manager, {
        amount: "1.201",
        entryType: "ADJUSTMENT_DECREASE",
        reason: "Currency precision rejection proof",
        submissionIdempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_INVALID" });
    expect(await context.cashEffects(fixture)).toEqual(before);
  });

  it("rejects USD over-precise Shift report, then accepts trailing-zero cents", async () => {
    const fixture = await context.createPaymentFixture({ currency: "USD" });
    const employee = await context.actor(fixture, "VALET_EMPLOYEE");
    const shift = await context.startShift(fixture, employee);

    await expect(
      context.endShift(employee, shift.shiftId, "1.201"),
    ).rejects.toMatchObject({ code: "SHIFT_CASH_REPORT_INVALID" });
    expect(await context.shiftSnapshot(shift.shiftId)).toMatchObject({
      cash_reported: null,
      status: "ACTIVE",
    });
    expect(await context.countAudit(shift.shiftId, "SHIFT_ENDED")).toBe(0);

    await expect(
      context.endShift(employee, shift.shiftId, "1.200"),
    ).resolves.toMatchObject({
      cashReconciliation: { cashReported: "1.200", currency: "USD" },
      status: "ENDED",
    });
  });

  it("keeps non-zero third-decimal JOD Shift reporting valid", async () => {
    const fixture = await context.createPaymentFixture({ currency: "JOD" });
    const employee = await context.actor(fixture, "VALET_SUPERVISOR");
    const shift = await context.startShift(fixture, employee);
    await expect(
      context.endShift(employee, shift.shiftId, "1.201"),
    ).resolves.toMatchObject({
      cashReconciliation: { cashReported: "1.201", currency: "JOD" },
    });
  });
});
