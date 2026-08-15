import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInitializePaymentExecutor } from "../src/modules/payments/initialize-payment-command";
import { PaymentTestContext } from "./payment-test-context";

const context = new PaymentTestContext("initialization");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-008A canonical Payment initialization", () => {
  it("copies Location currency and ignores non-contract caller authority", async () => {
    const fixture = await context.createPaymentFixture({
      currency: "AED",
      organizationFee: "8.250",
    });
    const execute = createInitializePaymentExecutor(context.runtimePool);
    const request = {
      amountDue: "999.000",
      currency: "USD",
      organizationId: randomUUID(),
      paymentMethodsPolicy: "DIGITAL_ONLY",
      servicePayer: "VENUE",
      valetSessionId: fixture.sessionId,
      locationId: randomUUID(),
      creationIdempotencyKey: randomUUID(),
    } as Parameters<typeof execute>[0];
    const result = await execute(request);
    expect(result).toMatchObject({
      amountDue: "8.250",
      currency: "AED",
      locationId: fixture.locationId,
      organizationId: fixture.organizationId,
      servicePayer: "CUSTOMER",
    });
  });

  it("creates CUSTOMER zero fee as exact NONE and NOT_REQUIRED", async () => {
    const fixture = await context.createPaymentFixture();
    expect(await context.initialize(fixture)).toMatchObject({
      amountDue: "0.000",
      amountPaid: "0.000",
      collectionMethod: "NONE",
      provider: null,
      providerReference: null,
      serviceAmount: "0.000",
      status: "NOT_REQUIRED",
      tipAmount: "0.000",
    });
  });

  it("creates positive CUSTOMER CASH_ONLY as CASH and UNPAID", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "12.375",
    });
    expect(await context.initialize(fixture)).toMatchObject({
      amountDue: "12.375",
      amountPaid: "0.000",
      collectionMethod: "CASH",
      provider: null,
      providerReference: null,
      serviceAmount: "12.375",
      servicePayer: "CUSTOMER",
      status: "UNPAID",
      tipAmount: "0.000",
    });
  });

  it("appends one safe system-actor Payment initialization audit", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "6.125",
    });
    const payment = await context.initialize(fixture);
    const audit = await context.adminPool.query<{
      actor_membership_id: string | null;
      entity_id: string;
      entity_type: string;
      event_type: string;
      metadata_json: Record<string, unknown>;
    }>(
      `SELECT actor_membership_id::text, entity_type, entity_id::text,
              event_type, metadata_json
       FROM audit_events
       WHERE valet_session_id = $1 AND event_type = 'PAYMENT_INITIALIZED'`,
      [fixture.sessionId],
    );
    expect(audit.rows).toEqual([
      expect.objectContaining({
        actor_membership_id: null,
        entity_id: payment.id,
        entity_type: "Payment",
        event_type: "PAYMENT_INITIALIZED",
        metadata_json: expect.objectContaining({
          amount_due: "6.125",
          collection_method: "CASH",
          currency: "JOD",
          payment_id: payment.id,
          service_amount: "6.125",
          service_payer: "CUSTOMER",
          status: "UNPAID",
          tip_amount: "0.000",
        }),
      }),
    ]);
  });

  it("uses CASH fallback for positive CASH_OR_DIGITAL without a provider", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "3.500",
      organizationMethods: "CASH_OR_DIGITAL",
    });
    expect(await context.initialize(fixture)).toMatchObject({
      amountDue: "3.500",
      collectionMethod: "CASH",
      provider: null,
      providerReference: null,
      status: "UNPAID",
    });
  });

  it("keeps VENUE service fee snapshot but makes customer amount due zero", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "18.000",
      organizationPayer: "VENUE",
    });
    expect(await context.initialize(fixture)).toMatchObject({
      amountDue: "0.000",
      collectionMethod: "NONE",
      serviceAmount: "18.000",
      servicePayer: "VENUE",
      status: "NOT_REQUIRED",
      tipAmount: "0.000",
    });
  });

  it("fails positive DIGITAL_ONLY atomically before writes", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "1.000",
      organizationMethods: "DIGITAL_ONLY",
    });
    await expect(context.initialize(fixture)).rejects.toMatchObject({
      code: "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE",
    });
    expect(await context.effects(fixture.sessionId)).toMatchObject({
      counts: { audit_count: 0 },
      payments: [],
    });
  });

  it("permits zero-due DIGITAL_ONLY as NONE and NOT_REQUIRED", async () => {
    const fixture = await context.createPaymentFixture({
      organizationMethods: "DIGITAL_ONLY",
    });
    expect(await context.initialize(fixture)).toMatchObject({
      amountDue: "0.000",
      collectionMethod: "NONE",
      provider: null,
      status: "NOT_REQUIRED",
    });
  });

  it("returns historical Payment unchanged after policy changes", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "2.250",
    });
    const key = randomUUID();
    const first = await context.initialize(fixture, key);
    await context.adminPool.query(
      `UPDATE organizations
       SET valet_service_fee = 99, payment_service_payer = 'VENUE',
           payment_methods_policy = 'DIGITAL_ONLY',
           updated_at = transaction_timestamp()
       WHERE id = $1`,
      [fixture.organizationId],
    );
    const retried = await context.initialize(fixture, key);
    expect(retried).toEqual(first);
    expect((await context.effects(fixture.sessionId)).counts.audit_count).toBe(
      1,
    );
  });

  it("retries the same session to one Payment and one AuditEvent", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "4.000",
    });
    const key = randomUUID();
    const first = await context.initialize(fixture, key);
    const second = await context.initialize(fixture, key);
    expect(second.id).toBe(first.id);
    expect(await context.effects(fixture.sessionId)).toMatchObject({
      counts: { audit_count: 1 },
      payments: [{ id: first.id }],
    });
  });

  it("rejects one Organization key reused for another session", async () => {
    const first = await context.createPaymentFixture({
      organizationFee: "4.000",
    });
    const second = await context.addSession(first);
    const key = randomUUID();
    await context.initialize(first, key);
    await expect(context.initialize(second, key)).rejects.toMatchObject({
      code: "PAYMENT_CREATION_IDEMPOTENCY_CONFLICT",
    });
    expect((await context.effects(second.sessionId)).payments).toEqual([]);
  });

  it("scopes identical textual keys independently by Organization", async () => {
    const first = await context.createPaymentFixture({ organizationFee: "1" });
    const second = await context.createPaymentFixture({ organizationFee: "2" });
    const key = randomUUID();
    const [paymentA, paymentB] = await Promise.all([
      context.initialize(first, key),
      context.initialize(second, key),
    ]);
    expect(paymentA.organizationId).toBe(first.organizationId);
    expect(paymentB.organizationId).toBe(second.organizationId);
    expect(paymentB.id).not.toBe(paymentA.id);
  });

  it("creates no later-slice rows and does not mutate operational state", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "5.000",
    });
    const before = await context.sessionSnapshot(fixture.sessionId);
    await context.initialize(fixture);
    const effects = await context.effects(fixture.sessionId);
    expect(effects.counts).toEqual({
      audit_count: 1,
      cash_count: 0,
      provider_event_count: 0,
      refund_count: 0,
      validation_count: 0,
    });
    expect(await context.sessionSnapshot(fixture.sessionId)).toEqual(before);
    const operations = await context.adminPool.query<{
      dispatch_count: number;
      handoff_count: number;
      task_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer FROM tasks WHERE valet_session_id = $1)
           AS task_count,
         (SELECT count(*)::integer FROM dispatch_events AS event
          INNER JOIN tasks AS task ON task.id = event.task_id
          WHERE task.valet_session_id = $1) AS dispatch_count,
         (SELECT count(*)::integer FROM handoff_verifications
          WHERE valet_session_id = $1) AS handoff_count`,
      [fixture.sessionId],
    );
    expect(operations.rows[0]).toEqual({
      dispatch_count: 0,
      handoff_count: 0,
      task_count: 0,
    });
  });
});
