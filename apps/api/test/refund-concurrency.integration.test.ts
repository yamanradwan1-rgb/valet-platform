import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expectRefundError, RefundTestContext } from "./refund-test-context";

const context = new RefundTestContext("concurrency");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-008F Refund concurrency and rollback", () => {
  it("converges concurrent same-key requests on one Refund and audit", async () => {
    const { fixture } = await context.collectedPayment("DIGITAL");
    const manager = await context.actor(fixture);
    const request = {
      amount: "5.000",
      idempotencyKey: randomUUID(),
      reason: "Concurrent retry",
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        context.refund(fixture, manager, request),
      ),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    const effects = await context.refundEffects(fixture);
    expect(effects.refunds).toHaveLength(1);
    expect(effects.audits).toHaveLength(1);
  });

  it("serializes different keys so final exposure cannot be over-refunded", async () => {
    const { fixture } = await context.collectedPayment("DIGITAL");
    const manager = await context.actor(fixture);
    const requests = ["first", "second"].map((reason) =>
      context.refund(fixture, manager, {
        amount: "6.000",
        idempotencyKey: randomUUID(),
        reason,
      }),
    );
    const settled = await Promise.allSettled(requests);
    expect(
      settled.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      settled.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const effects = await context.refundEffects(fixture);
    expect(effects.refunds).toHaveLength(1);
    expect(effects.refunds[0]?.amount).toBe("6.000");
    expect(effects.audits).toHaveLength(1);
  });

  it("rolls back a failed audit and permits a clean retry", async () => {
    const { fixture } = await context.collectedPayment();
    const manager = await context.actor(fixture);
    const request = {
      amount: "2.000",
      idempotencyKey: randomUUID(),
      reason: "Rollback proof",
    };
    await expect(
      context.refund(fixture, manager, request, {
        auditEventIdFactory: () => "not-a-uuid",
      }),
    ).rejects.toBeDefined();
    expect((await context.refundEffects(fixture)).refunds).toHaveLength(0);
    await expect(
      context.refund(fixture, manager, request),
    ).resolves.toMatchObject({
      status: "SUCCEEDED",
    });
    const effects = await context.refundEffects(fixture);
    expect(effects.refunds).toHaveLength(1);
    expect(effects.audits).toHaveLength(1);
  });

  it("does not refund an incompatible or uncollected projection", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "10",
    });
    await context.initialize(fixture);
    const manager = await context.actor(fixture);
    await expectRefundError(
      context.refund(fixture, manager, {
        amount: "1.000",
        idempotencyKey: randomUUID(),
        reason: "Uncollected",
      }),
      "REFUND_NOT_ALLOWED",
    );
  });

  it("does not require an active custody state", async () => {
    const { fixture } = await context.collectedPayment();
    const manager = await context.actor(fixture);
    await context.adminPool.query(
      `UPDATE valet_sessions
       SET state = 'COMPLETED', completed_at = transaction_timestamp(),
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.sessionId],
    );
    await expect(
      context.refund(fixture, manager, {
        amount: "1.000",
        idempotencyKey: randomUUID(),
        reason: "Post handoff",
      }),
    ).resolves.toMatchObject({ status: "SUCCEEDED" });
  });
});
