import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInitializePaymentExecutor } from "../src/modules/payments/initialize-payment-command";
import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("financial_release");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function setPolicy(
  fixture: { locationId: string; organizationId: string },
  organizationRequires: boolean,
  locationOverride: boolean | null = null,
  serviceFee = "0.000",
) {
  await context.adminPool.query(
    `UPDATE organizations
     SET release_requires_payment = $2, valet_service_fee = $3,
         payment_service_payer = 'CUSTOMER',
         payment_methods_policy = 'CASH_ONLY'
     WHERE id = $1`,
    [fixture.organizationId, organizationRequires, serviceFee],
  );
  await context.adminPool.query(
    `UPDATE locations SET release_requires_payment_override = $2
     WHERE id = $1`,
    [fixture.locationId, locationOverride],
  );
}

async function initialize(sessionId: string) {
  return createInitializePaymentExecutor(context.runtimePool)({
    creationIdempotencyKey: randomUUID(),
    valetSessionId: sessionId,
  });
}

async function makePaid(paymentId: string, method: "CASH" | "DIGITAL") {
  await context.adminPool.query(
    `UPDATE payments
     SET status = 'PAID', amount_paid = amount_due,
         collection_method = $2, paid_at = transaction_timestamp(),
         provider = $3, provider_reference = $4
     WHERE id = $1`,
    [
      paymentId,
      method,
      method === "DIGITAL" ? "safe-provider" : null,
      method === "DIGITAL" ? `reference-${randomUUID()}` : null,
    ],
  );
}

describe("VAL-008G financial complete-handoff guard", () => {
  it("passes without a Payment when current policy does not require one", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await setPolicy(fixture, false);
    await expect(context.complete(fixture)).resolves.toMatchObject({
      state: "COMPLETED",
    });
  });

  it("uses Company-default then nullable Location-override policy", async () => {
    const allowed = await context.prepareStandard("PICKUP_CODE");
    await setPolicy(allowed, true, false);
    await expect(context.complete(allowed)).resolves.toMatchObject({
      state: "COMPLETED",
    });

    const blocked = await context.prepareStandard("PICKUP_CODE");
    await setPolicy(blocked, false, true);
    await expect(context.complete(blocked)).rejects.toMatchObject({
      code: "FINANCIAL_RELEASE_NOT_SATISFIED",
    });
  });

  it("blocks missing Payment atomically before every terminal effect", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await setPolicy(fixture, true);
    const before = await context.releaseEffects(fixture);
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "FINANCIAL_RELEASE_NOT_SATISFIED",
      message: "The financial release requirement is not satisfied.",
    });
    expect(await context.releaseEffects(fixture)).toEqual(before);
  });

  it("accepts the exact canonical zero-due NOT_REQUIRED state", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await setPolicy(fixture, true);
    await initialize(fixture.sessionId);
    await expect(context.complete(fixture)).resolves.toMatchObject({
      state: "COMPLETED",
    });
    const effects = await context.releaseEffects(fixture);
    expect(effects.projection).toMatchObject({
      completed_at: expect.any(Date),
      completed_by_membership_id: fixture.membershipId,
      key_slot_id: null,
      request_status: "COMPLETED",
      session_state: "COMPLETED",
      session_version: 10,
      task_assignee: fixture.membershipId,
      task_status: "COMPLETED",
      task_version: 5,
    });
    expect(effects.verifications.at(-1)?.consumed_at).toEqual(expect.any(Date));
    expect(
      effects.custody.filter((event) => event.event_type === "RELEASED"),
    ).toEqual([
      expect.objectContaining({
        actor_membership_id: fixture.membershipId,
        key_slot_id: fixture.keySlotId,
      }),
    ]);
    expect(
      effects.dispatch.filter((event) => event.event_type === "COMPLETED"),
    ).toEqual([
      expect.objectContaining({
        actor_membership_id: fixture.membershipId,
        new_assignee_membership_id: fixture.membershipId,
      }),
    ]);
    expect(effects.audits.map((event) => event.event_type).sort()).toEqual([
      "VALET_SESSION_COMPLETED",
      "VALET_SESSION_VEHICLE_RELEASED",
    ]);
  });

  it("evaluates current release policy rather than a Payment-time snapshot", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await setPolicy(fixture, false, null, "10.000");
    await initialize(fixture.sessionId);
    await setPolicy(fixture, true, null, "10.000");
    await expect(context.complete(fixture)).rejects.toMatchObject({
      code: "FINANCIAL_RELEASE_NOT_SATISFIED",
    });
    expect(
      (await context.releaseEffects(fixture)).projection.session_state,
    ).toBe("HANDOFF_PENDING");
  });

  it.each(["CASH", "DIGITAL"] as const)(
    "accepts a coherent fully collected %s Payment",
    async (method) => {
      const fixture = await context.prepareStandard("PICKUP_CODE");
      await setPolicy(fixture, true, null, "10.000");
      const payment = await initialize(fixture.sessionId);
      await makePaid(payment.id, method);
      await expect(context.complete(fixture)).resolves.toMatchObject({
        state: "COMPLETED",
      });
    },
  );

  it.each([
    { method: "CASH", status: "UNPAID" },
    { method: "DIGITAL", status: "PENDING" },
    { method: "DIGITAL", status: "FAILED" },
  ] as const)(
    "fails closed for coherent but unsatisfied $status state",
    async ({ method, status }) => {
      const fixture = await context.prepareStandard("PICKUP_CODE");
      await setPolicy(fixture, true, null, "10.000");
      const payment = await initialize(fixture.sessionId);
      await context.adminPool.query(
        `UPDATE payments
         SET status = $2, amount_paid = 0, collection_method = $3,
             provider = $4, provider_reference = $5
         WHERE id = $1`,
        [
          payment.id,
          status,
          method,
          method === "DIGITAL" ? "safe-provider" : null,
          status === "PENDING" ? `reference-${randomUUID()}` : null,
        ],
      );
      const before = await context.releaseEffects(fixture);
      await expect(context.complete(fixture)).rejects.toMatchObject({
        code: "FINANCIAL_RELEASE_NOT_SATISFIED",
      });
      expect(await context.releaseEffects(fixture)).toEqual(before);
    },
  );

  it("ignores every Refund status and leaves financial history unchanged", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await setPolicy(fixture, true, null, "10.000");
    const payment = await initialize(fixture.sessionId);
    await makePaid(payment.id, "CASH");
    const now = new Date("2026-08-20T12:00:00Z");
    for (const [index, status] of [
      "PENDING",
      "SUCCEEDED",
      "FAILED",
    ].entries()) {
      await context.adminPool.query(
        `INSERT INTO refunds
           (id, organization_id, payment_id, amount, reason, status,
            authorized_by_membership_id, idempotency_key, provider,
            provider_reference, requested_at, completed_at)
         VALUES ($1, $2, $3, 1, 'Safe reason', $4, $5, $6, $7, $8,
                 $9, $10)`,
        [
          randomUUID(),
          fixture.organizationId,
          payment.id,
          status,
          fixture.membershipId,
          randomUUID(),
          status === "SUCCEEDED" ? null : `provider-${index}`,
          null,
          new Date(now.getTime() + index * 1000),
          status === "SUCCEEDED" ? now : null,
        ],
      );
    }
    const beforePayment = await context.adminPool.query(
      `SELECT * FROM payments WHERE id = $1`,
      [payment.id],
    );
    const beforeRefunds = await context.adminPool.query(
      `SELECT * FROM refunds WHERE payment_id = $1 ORDER BY requested_at, id`,
      [payment.id],
    );
    await expect(context.complete(fixture)).resolves.toMatchObject({
      state: "COMPLETED",
    });
    const afterPayment = await context.adminPool.query(
      `SELECT * FROM payments WHERE id = $1`,
      [payment.id],
    );
    const afterRefunds = await context.adminPool.query(
      `SELECT * FROM refunds WHERE payment_id = $1 ORDER BY requested_at, id`,
      [payment.id],
    );
    expect(afterPayment.rows).toEqual(beforePayment.rows);
    expect(afterRefunds.rows).toEqual(beforeRefunds.rows);
  });
});
