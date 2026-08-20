import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createInitializePaymentExecutor } from "../src/modules/payments/initialize-payment-command";
import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("financial_concurrency");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

async function waitForLockWait(queryFragment: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const result = await context.adminPool.query<{ waiting: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_stat_activity
         WHERE datname = current_database()
           AND wait_event_type = 'Lock'
           AND query ILIKE $1
       ) AS waiting`,
      [`%${queryFragment}%`],
    );
    if (result.rows[0]?.waiting === true) return;
  }
  throw new Error(`Expected a lock wait for ${queryFragment}.`);
}

async function setRequiredPolicy(
  fixture: { organizationId: string },
  fee = "10.000",
) {
  await context.adminPool.query(
    `UPDATE organizations
     SET release_requires_payment = true, valet_service_fee = $2,
         payment_service_payer = 'CUSTOMER',
         payment_methods_policy = 'CASH_ONLY'
     WHERE id = $1`,
    [fixture.organizationId, fee],
  );
}

describe("VAL-008G financial release serialization", () => {
  it.each(["COMMIT", "ROLLBACK"] as const)(
    "evaluates the authoritative Payment state after concurrent outcome %s",
    async (resolution) => {
      const fixture = await context.prepareStandard("PICKUP_CODE");
      await setRequiredPolicy(fixture);
      const payment = await createInitializePaymentExecutor(
        context.runtimePool,
      )({
        creationIdempotencyKey: randomUUID(),
        valetSessionId: fixture.sessionId,
      });
      const blocker = await context.adminPool.connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          `UPDATE payments
           SET status = 'PAID', amount_paid = amount_due,
               paid_at = transaction_timestamp()
           WHERE id = $1`,
          [payment.id],
        );
        const completion = context.complete(fixture).then(
          (value) => ({ kind: "FULFILLED" as const, value }),
          (error: unknown) => ({ error, kind: "REJECTED" as const }),
        );
        await waitForLockWait("FROM payments");
        await blocker.query(resolution);
        if (resolution === "COMMIT") {
          await expect(completion).resolves.toMatchObject({
            kind: "FULFILLED",
            value: { state: "COMPLETED" },
          });
        } else {
          await expect(completion).resolves.toMatchObject({
            error: { code: "FINANCIAL_RELEASE_NOT_SATISFIED" },
            kind: "REJECTED",
          });
          expect(
            (await context.releaseEffects(fixture)).projection.session_state,
          ).toBe("HANDOFF_PENDING");
        }
      } finally {
        try {
          await blocker.query("ROLLBACK");
        } finally {
          blocker.release();
        }
      }
    },
  );

  it.each(["COMMIT", "ROLLBACK"] as const)(
    "evaluates current policy after concurrent Location policy %s",
    async (resolution) => {
      const fixture = await context.prepareStandard("PICKUP_CODE");
      await setRequiredPolicy(fixture, "0.000");
      const blocker = await context.adminPool.connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          `UPDATE locations
           SET release_requires_payment_override = false
           WHERE id = $1`,
          [fixture.locationId],
        );
        const completion = context.complete(fixture).then(
          (value) => ({ kind: "FULFILLED" as const, value }),
          (error: unknown) => ({ error, kind: "REJECTED" as const }),
        );
        await waitForLockWait("FROM organizations");
        await blocker.query(resolution);
        if (resolution === "COMMIT") {
          await expect(completion).resolves.toMatchObject({
            kind: "FULFILLED",
            value: { state: "COMPLETED" },
          });
        } else {
          await expect(completion).resolves.toMatchObject({
            error: { code: "FINANCIAL_RELEASE_NOT_SATISFIED" },
            kind: "REJECTED",
          });
          expect(
            (await context.releaseEffects(fixture)).projection.session_state,
          ).toBe("HANDOFF_PENDING");
        }
      } finally {
        try {
          await blocker.query("ROLLBACK");
        } finally {
          blocker.release();
        }
      }
    },
  );
});
