import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PaymentTestContext } from "./payment-test-context";

const context = new PaymentTestContext("atomicity");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-008A Payment concurrency and atomicity", () => {
  it("serializes concurrent same-session initialization", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "9.750",
    });
    const key = randomUUID();
    const results = await Promise.all([
      context.initialize(fixture, key),
      context.initialize(fixture, key),
      context.initialize(fixture, key),
    ]);
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(await context.effects(fixture.sessionId)).toMatchObject({
      counts: { audit_count: 1 },
      payments: [{ id: results[0]?.id }],
    });
  });

  it("returns one canonical Payment for concurrent distinct retry keys", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "2.000",
    });
    const results = await Promise.all([
      context.initialize(fixture, randomUUID()),
      context.initialize(fixture, randomUUID()),
    ]);
    expect(results[0]?.id).toBe(results[1]?.id);
    expect((await context.effects(fixture.sessionId)).counts.audit_count).toBe(
      1,
    );
  });

  it("allows only one session to claim a concurrently reused tenant key", async () => {
    const first = await context.createPaymentFixture({ organizationFee: "3" });
    const second = await context.addSession(first);
    const key = randomUUID();
    const settled = await Promise.allSettled([
      context.initialize(first, key),
      context.initialize(second, key),
    ]);
    expect(
      settled.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      settled.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const paymentCount = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM payments
       WHERE organization_id = $1 AND creation_idempotency_key = $2`,
      [first.organizationId, key],
    );
    expect(paymentCount.rows[0]?.count).toBe(1);
  });

  it("rolls Payment back when required AuditEvent insertion fails", async () => {
    const fixture = await context.createPaymentFixture({
      organizationFee: "11.000",
    });
    await context.adminPool.query(
      `CREATE FUNCTION reject_payment_initialized_audit() RETURNS trigger
         LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.event_type = 'PAYMENT_INITIALIZED' THEN
             RAISE EXCEPTION 'injected payment audit failure';
           END IF;
           RETURN NEW;
         END $$;
       CREATE TRIGGER reject_payment_initialized_audit_trigger
         BEFORE INSERT ON audit_events FOR EACH ROW
         EXECUTE FUNCTION reject_payment_initialized_audit()`,
    );
    try {
      await expect(context.initialize(fixture)).rejects.toBeInstanceOf(Error);
    } finally {
      await context.adminPool.query(
        `DROP TRIGGER reject_payment_initialized_audit_trigger ON audit_events;
         DROP FUNCTION reject_payment_initialized_audit()`,
      );
    }
    expect(await context.effects(fixture.sessionId)).toMatchObject({
      counts: { audit_count: 0 },
      payments: [],
    });
  });
});
