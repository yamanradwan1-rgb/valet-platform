import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CashTestContext, expectCashError } from "./cash-test-context";

const context = new CashTestContext("collection");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function positiveFixture() {
  const fixture = await context.createPaymentFixture({
    organizationFee: "10.000",
    organizationTips: true,
  });
  await context.initialize(fixture);
  return fixture;
}

describe("VAL-008C cash receipt and correction", () => {
  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const)(
    "lets an active same-Location %s record the full server-derived receipt",
    async (role) => {
      const fixture = await positiveFixture();
      const actor = await context.actor(fixture, role);
      await context.startShift(fixture, actor);
      const before = await context.sessionSnapshot(fixture.sessionId);
      const result = await context.receipt(fixture, actor, randomUUID());
      expect(result).toMatchObject({
        amountDue: "10.000",
        amountPaid: "10.000",
        cashEntry: { amount: "10.000", type: "RECEIPT" },
        currency: "JOD",
        status: "PAID",
      });
      const effects = await context.cashEffects(fixture);
      expect(effects.entries).toHaveLength(1);
      expect(effects.audits).toHaveLength(1);
      expect(effects.payment).toMatchObject({
        amount_paid: "10.000",
        status: "PAID",
      });
      expect((await context.effects(fixture.sessionId)).counts).toMatchObject({
        provider_event_count: 0,
        refund_count: 0,
        validation_count: 0,
      });
      expect(await context.sessionSnapshot(fixture.sessionId)).toEqual(before);
    },
  );

  it("lets a Location Manager receive without a Shift and denies unsupported authority", async () => {
    const fixture = await positiveFixture();
    const manager = await context.actor(fixture, "LOCATION_MANAGER");
    await expect(
      context.receipt(fixture, manager, randomUUID()),
    ).resolves.toMatchObject({
      status: "PAID",
    });

    for (const role of [
      "VALET_EMPLOYEE",
      "VALET_SUPERVISOR",
      "ORG_ADMIN",
    ] as const) {
      const target = await positiveFixture();
      const actor = await context.actor(target, role);
      await expectCashError(
        context.receipt(target, actor, randomUUID()),
        "AUTHORIZATION_DENIED",
      );
    }
  });

  it("conceals wrong Location and tenant and rejects non-collectible payment state", async () => {
    const owned = await positiveFixture();
    const actor = await context.actor(owned, "VALET_EMPLOYEE");
    await context.startShift(owned, actor);
    const otherLocation = await context.addLocation(owned);
    const wrongLocation = await context.addSession({
      ...owned,
      locationId: otherLocation,
    });
    await context.initialize(wrongLocation);
    await expectCashError(
      context.receipt(wrongLocation, actor, randomUUID()),
      "AUTHORIZATION_DENIED",
    );
    const foreign = await positiveFixture();
    await expectCashError(
      context.receipt(foreign, actor, randomUUID()),
      "AUTHORIZATION_DENIED",
    );
    const zero = await context.createPaymentFixture();
    await context.initialize(zero);
    const manager = await context.actor(zero, "LOCATION_MANAGER");
    await expectCashError(
      context.receipt(zero, manager, randomUUID()),
      "CASH_COLLECTION_NOT_ALLOWED",
    );
  });

  it("deduplicates retry and concurrent same-key receipt into one financial effect", async () => {
    const fixture = await positiveFixture();
    const manager = await context.actor(fixture, "LOCATION_MANAGER");
    const key = randomUUID();
    const results = await Promise.all([
      context.receipt(fixture, manager, key),
      context.receipt(fixture, manager, key),
    ]);
    expect(results[0].cashEntry.id).toBe(results[1].cashEntry.id);
    await expect(context.receipt(fixture, manager, key)).resolves.toEqual(
      results[0],
    );
    const effects = await context.cashEffects(fixture);
    expect(effects.entries).toHaveLength(1);
    expect(effects.audits).toHaveLength(1);
    const otherSession = await context.addSession(fixture);
    await context.initialize(otherSession);
    await expectCashError(
      context.receipt(otherSession, manager, key),
      "CASH_IDEMPOTENCY_CONFLICT",
    );
    const foreign = await positiveFixture();
    const foreignManager = await context.actor(foreign, "LOCATION_MANAGER");
    await expect(
      context.receipt(foreign, foreignManager, key),
    ).resolves.toMatchObject({
      status: "PAID",
    });
    await expectCashError(
      context.receipt(fixture, manager, randomUUID()),
      "CASH_COLLECTION_NOT_ALLOWED",
    );
  });

  it("applies Manager-only append corrections and prevents negative or excess net cash", async () => {
    const fixture = await positiveFixture();
    const manager = await context.actor(fixture, "LOCATION_MANAGER");
    await context.receipt(fixture, manager, randomUUID());
    const decrease = {
      amount: "4.000",
      entryType: "ADJUSTMENT_DECREASE" as const,
      reason: "Correct duplicated recorded notes",
      submissionIdempotencyKey: randomUUID(),
    };
    const corrected = await context.adjustment(fixture, manager, decrease);
    expect(corrected).toMatchObject({ amountPaid: "6.000", status: "UNPAID" });
    await expect(
      context.adjustment(fixture, manager, decrease),
    ).resolves.toEqual(corrected);
    await expectCashError(
      context.adjustment(fixture, manager, {
        ...decrease,
        amount: "7.000",
        submissionIdempotencyKey: randomUUID(),
      }),
      "CASH_ADJUSTMENT_NOT_ALLOWED",
    );
    const employee = await context.actor(fixture, "VALET_EMPLOYEE");
    await expectCashError(
      context.adjustment(fixture, employee, {
        ...decrease,
        submissionIdempotencyKey: randomUUID(),
      }),
      "AUTHORIZATION_DENIED",
    );
    expect((await context.cashEffects(fixture)).entries).toHaveLength(2);
  });

  it("serializes receipt against a pre-collection tip mutation", async () => {
    const fixture = await positiveFixture();
    const manager = await context.actor(fixture, "LOCATION_MANAGER");
    const raced = await Promise.allSettled([
      context.receipt(fixture, manager, randomUUID()),
      context.managerTip(fixture, manager, "2.000"),
    ]);
    expect(raced.some((result) => result.status === "fulfilled")).toBe(true);
    const effects = await context.cashEffects(fixture);
    expect(effects.entries).toHaveLength(1);
    expect(effects.payment).toMatchObject({ status: "PAID" });
    expect(effects.payment.amount_paid).toBe(effects.payment.amount_due);
    expect(effects.entries[0]!.amount).toBe(effects.payment.amount_due);
  });

  it("serializes competing decreases and rolls Payment, CashEntry, and audit back together", async () => {
    const fixture = await positiveFixture();
    const manager = await context.actor(fixture, "LOCATION_MANAGER");
    await context.receipt(fixture, manager, randomUUID());
    const adjustment = (key: string) =>
      context.adjustment(fixture, manager, {
        amount: "7.000",
        entryType: "ADJUSTMENT_DECREASE",
        reason: "Concurrent correction proof",
        submissionIdempotencyKey: key,
      });
    const raced = await Promise.allSettled([
      adjustment(randomUUID()),
      adjustment(randomUUID()),
    ]);
    expect(
      raced.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await context.cashEffects(fixture)).payment.amount_paid).toBe(
      "3.000",
    );

    const second = await context.addSession(fixture);
    await context.initialize(second);
    const duplicateAuditId = (await context.cashEffects(fixture)).audits[0]!.id;
    await expect(
      context.receipt(second, manager, randomUUID(), {
        auditEventIdFactory: () => duplicateAuditId,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    const effects = await context.cashEffects(second);
    expect(effects.entries).toHaveLength(0);
    expect(effects.payment).toMatchObject({
      amount_paid: "0.000",
      status: "UNPAID",
    });
  });

  it("keeps CashEntry append-only for the production runtime role", async () => {
    const fixture = await positiveFixture();
    const manager = await context.actor(fixture, "LOCATION_MANAGER");
    await context.receipt(fixture, manager, randomUUID());
    const entry = (await context.cashEffects(fixture)).entries[0]!;
    await expect(
      context.runtimePool.query(
        `UPDATE cash_entries SET amount = 1 WHERE id = $1`,
        [entry.id],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      context.runtimePool.query(`DELETE FROM cash_entries WHERE id = $1`, [
        entry.id,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
