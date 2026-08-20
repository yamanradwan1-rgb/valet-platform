import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectRefundError, RefundTestContext } from "./refund-test-context";

const context = new RefundTestContext("core");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-008F Refund core", () => {
  it("creates immediate cash Refund history without rewriting collection facts", async () => {
    const { fixture } = await context.collectedPayment("CASH");
    const manager = await context.actor(fixture);
    const before = await context.refundEffects(fixture);
    const result = await context.refund(fixture, manager, {
      amount: "2.500",
      idempotencyKey: randomUUID(),
      reason: "  Customer service recovery  ",
    });
    const after = await context.refundEffects(fixture);

    expect(result).toMatchObject({
      amount: "2.500",
      currency: "JOD",
      status: "SUCCEEDED",
    });
    expect(result.completedAt).toEqual(result.requestedAt);
    expect(after.refunds).toHaveLength(1);
    expect(after.refunds[0]).toMatchObject({
      authorized_by_membership_id: manager.membershipId,
      provider: null,
      provider_reference: null,
      reason: "Customer service recovery",
      status: "SUCCEEDED",
    });
    expect(after.audits).toHaveLength(1);
    expect(after.audits[0]).toMatchObject({
      actor_membership_id: manager.membershipId,
      entity_type: "Refund",
      event_type: "PAYMENT_REFUND_CREATED",
    });
    expect(after.audits[0]?.metadata_json).not.toHaveProperty("reason");
    expect(after.payment).toEqual(before.payment);
    expect(after.cash).toEqual(before.cash);
  });

  it("creates only a pending provider-neutral digital request", async () => {
    const { fixture } = await context.collectedPayment("DIGITAL");
    const manager = await context.actor(fixture);
    const before = await context.refundEffects(fixture);
    const result = await context.refund(fixture, manager, {
      amount: "4.000",
      idempotencyKey: randomUUID(),
      reason: "Digital return requested",
    });
    const after = await context.refundEffects(fixture);

    expect(result).toMatchObject({ completedAt: null, status: "PENDING" });
    expect(after.refunds[0]).toMatchObject({
      completed_at: null,
      provider: "provider-a",
      provider_reference: null,
      status: "PENDING",
    });
    expect(after.payment).toEqual(before.payment);
    expect(after.audits).toHaveLength(1);
  });

  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR", "ORG_ADMIN"] as const)(
    "denies %s Refund authority",
    async (role) => {
      const { fixture } = await context.collectedPayment();
      const actor = await context.actor(fixture, role);
      await expectRefundError(
        context.refund(fixture, actor, {
          amount: "1.000",
          idempotencyKey: randomUUID(),
          reason: "Forbidden role",
        }),
        "AUTHORIZATION_DENIED",
      );
      expect((await context.refundEffects(fixture)).refunds).toHaveLength(0);
    },
  );

  it("denies inactive and non-Location-scoped manager authority", async () => {
    const { fixture } = await context.collectedPayment();
    const inactive = await context.actor(fixture, "LOCATION_MANAGER", {
      membershipStatus: "INACTIVE",
    });
    const noAccess = await context.actor(fixture, "LOCATION_MANAGER", {
      locationAccess: false,
    });
    for (const actor of [inactive, noAccess]) {
      await expectRefundError(
        context.refund(fixture, actor, {
          amount: "1.000",
          idempotencyKey: randomUUID(),
          reason: "Forbidden scope",
        }),
        "AUTHORIZATION_DENIED",
      );
    }
  });

  it("keeps cross-tenant Payment probing non-disclosing", async () => {
    const first = await context.collectedPayment();
    const second = await context.collectedPayment();
    const foreignManager = await context.actor(second.fixture);
    await expectRefundError(
      context.refund(first.fixture, foreignManager, {
        amount: "1.000",
        idempotencyKey: randomUUID(),
        reason: "Foreign probe",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("keeps cross-Location Payment probing non-disclosing", async () => {
    const target = await context.collectedPayment();
    const otherLocationId = await context.addLocation(target.fixture);
    const otherSession = await context.addSession({
      ...target.fixture,
      locationId: otherLocationId,
    });
    const otherLocationManager = await context.actor(otherSession);
    await expectRefundError(
      context.refund(target.fixture, otherLocationManager, {
        amount: "1.000",
        idempotencyKey: randomUUID(),
        reason: "Location probe",
      }),
      "AUTHORIZATION_DENIED",
    );
  });

  it("enforces positive exact currency precision and collected balance", async () => {
    const { fixture } = await context.collectedPayment();
    const manager = await context.actor(fixture);
    for (const amount of ["0", "0.000", "1.0001", "10.001"]) {
      await expectRefundError(
        context.refund(fixture, manager, {
          amount,
          idempotencyKey: randomUUID(),
          reason: "Invalid amount",
        }),
        amount === "10.001" ? "REFUND_NOT_ALLOWED" : "REFUND_AMOUNT_INVALID",
      );
    }
    const usd = await context.collectedPayment();
    await context.adminPool.query(
      `UPDATE payments SET currency = 'USD' WHERE valet_session_id = $1`,
      [usd.fixture.sessionId],
    );
    const usdManager = await context.actor(usd.fixture);
    await expectRefundError(
      context.refund(usd.fixture, usdManager, {
        amount: "1.001",
        idempotencyKey: randomUUID(),
        reason: "Over precise",
      }),
      "REFUND_AMOUNT_INVALID",
    );
  });

  it("permits partial and multiple refunds while reserving pending exposure", async () => {
    const { fixture } = await context.collectedPayment("DIGITAL");
    const manager = await context.actor(fixture);
    await context.refund(fixture, manager, {
      amount: "3.000",
      idempotencyKey: randomUUID(),
      reason: "First partial",
    });
    await context.refund(fixture, manager, {
      amount: "7.000",
      idempotencyKey: randomUUID(),
      reason: "Final partial",
    });
    await expectRefundError(
      context.refund(fixture, manager, {
        amount: "0.001",
        idempotencyKey: randomUUID(),
        reason: "No balance",
      }),
      "REFUND_NOT_ALLOWED",
    );
    expect((await context.refundEffects(fixture)).refunds).toHaveLength(2);
  });

  it("frees failed exposure but keeps same-key failed history", async () => {
    const { fixture } = await context.collectedPayment("DIGITAL");
    const manager = await context.actor(fixture);
    const key = randomUUID();
    const pending = await context.refund(fixture, manager, {
      amount: "10.000",
      idempotencyKey: key,
      reason: "Provider attempt",
    });
    await context.reconcileRefund(fixture, pending.id, "REFUND_FAILED");
    const retry = await context.refund(fixture, manager, {
      amount: "10.000",
      idempotencyKey: key,
      reason: "Provider attempt",
    });
    expect(retry).toMatchObject({ id: pending.id, status: "FAILED" });
    await context.refund(fixture, manager, {
      amount: "10.000",
      idempotencyKey: randomUUID(),
      reason: "Fresh provider attempt",
    });
    const effects = await context.refundEffects(fixture);
    expect(effects.refunds).toHaveLength(2);
    expect(effects.audits).toHaveLength(2);
  });

  it("composes with authenticated successful digital reconciliation", async () => {
    const { fixture } = await context.collectedPayment("DIGITAL");
    const manager = await context.actor(fixture);
    const before = await context.refundEffects(fixture);
    const pending = await context.refund(fixture, manager, {
      amount: "3.000",
      idempotencyKey: randomUUID(),
      reason: "Successful provider return",
    });
    await expect(
      context.reconcileRefund(fixture, pending.id, "REFUND_SUCCEEDED"),
    ).resolves.toMatchObject({ processingStatus: "PROCESSED" });
    const after = await context.refundEffects(fixture);
    expect(after.refunds[0]).toMatchObject({
      provider: "provider-a",
      provider_reference: expect.any(String),
      status: "SUCCEEDED",
    });
    expect(after.refunds[0]?.completed_at).toBeInstanceOf(Date);
    expect(after.payment).toEqual(before.payment);
    expect(after.audits).toHaveLength(1);
  });

  it("returns exact retries and rejects immutable identity conflicts", async () => {
    const { fixture } = await context.collectedPayment();
    const manager = await context.actor(fixture);
    const anotherManager = await context.actor(fixture);
    const key = randomUUID();
    const request = { amount: "2.000", idempotencyKey: key, reason: "Exact" };
    const first = await context.refund(fixture, manager, request);
    expect(await context.refund(fixture, manager, request)).toEqual(first);
    for (const [actor, change] of [
      [manager, { ...request, amount: "1.000" }],
      [manager, { ...request, reason: "Changed" }],
      [anotherManager, request],
    ] as const) {
      await expectRefundError(
        context.refund(fixture, actor, change),
        "REFUND_IDEMPOTENCY_CONFLICT",
      );
    }
    const effects = await context.refundEffects(fixture);
    expect(effects.refunds).toHaveLength(1);
    expect(effects.audits).toHaveLength(1);
  });

  it("rejects reuse of a tenant key for another canonical Payment", async () => {
    const first = await context.collectedPayment();
    const secondFixture = await context.addSession(first.fixture);
    const secondPayment = await context.initialize(secondFixture);
    await context.adminPool.query(
      `UPDATE payments SET amount_paid = amount_due, status = 'PAID',
                           paid_at = transaction_timestamp(),
                           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [secondPayment.id],
    );
    const manager = await context.actor(first.fixture);
    const key = randomUUID();
    await context.refund(first.fixture, manager, {
      amount: "1.000",
      idempotencyKey: key,
      reason: "First Payment",
    });
    await expectRefundError(
      context.refund(secondFixture, manager, {
        amount: "1.000",
        idempotencyKey: key,
        reason: "First Payment",
      }),
      "REFUND_IDEMPOTENCY_CONFLICT",
    );
  });
});
