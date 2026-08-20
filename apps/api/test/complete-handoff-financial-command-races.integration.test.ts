import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCashReceiptExecutor } from "../src/modules/payments/cash-command";
import { createInitializePaymentExecutor } from "../src/modules/payments/initialize-payment-command";
import { createProviderEventIngress } from "../src/modules/payments/provider-event-ingress";
import type { ProviderEventAuthenticator } from "../src/modules/payments/provider-event-types";
import { CompleteHandoffTestContext } from "./complete-handoff-test-context";

const context = new CompleteHandoffTestContext("financial_command_races");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function settled<T>(operation: Promise<T>) {
  return operation.then(
    (value) => ({ kind: "FULFILLED" as const, value }),
    (error: unknown) => ({ error, kind: "REJECTED" as const }),
  );
}

async function waitForWaiters(fragment: string, minimum: number) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const result = await context.adminPool.query<{ count: number }>(
      `SELECT count(*)::integer AS count
       FROM pg_stat_activity
       WHERE datname = current_database() AND wait_event_type = 'Lock'
         AND query ILIKE $1`,
      [`%${fragment}%`],
    );
    if ((result.rows[0]?.count ?? 0) >= minimum) return;
  }
  throw new Error(`Expected ${minimum} lock waiters for ${fragment}.`);
}

async function configure(fixture: { organizationId: string }, fee: string) {
  await context.adminPool.query(
    `UPDATE organizations
     SET release_requires_payment = true, valet_service_fee = $2,
         payment_service_payer = 'CUSTOMER',
         payment_methods_policy = 'CASH_ONLY'
     WHERE id = $1`,
    [fixture.organizationId, fee],
  );
}

function initialize(sessionId: string) {
  return createInitializePaymentExecutor(context.runtimePool)({
    creationIdempotencyKey: randomUUID(),
    valetSessionId: sessionId,
  });
}

describe("VAL-008G release races with real financial commands", () => {
  it("re-checks after a concurrent cash receipt commits first", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await configure(fixture, "10.000");
    const payment = await initialize(fixture.sessionId);
    const blocker = await context.adminPool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(`SELECT id FROM payments WHERE id = $1 FOR UPDATE`, [
        payment.id,
      ]);
      const cash = settled(
        createCashReceiptExecutor(context.runtimePool)({
          authenticatedUserId: fixture.userId,
          submissionIdempotencyKey: randomUUID(),
          valetSessionId: fixture.sessionId,
        }),
      );
      await waitForWaiters("FROM payments", 1);
      const completion = settled(context.complete(fixture));
      await blocker.query("COMMIT");
      await expect(cash).resolves.toMatchObject({
        kind: "FULFILLED",
        value: { status: "PAID" },
      });
      await expect(completion).resolves.toMatchObject({
        kind: "FULFILLED",
        value: { state: "COMPLETED" },
      });
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it("re-checks after authenticated provider collection success commits first", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await configure(fixture, "10.000");
    const payment = await initialize(fixture.sessionId);
    const operationId = randomUUID();
    await context.adminPool.query(
      `UPDATE payments
       SET collection_method = 'DIGITAL', provider = 'provider-a'
       WHERE id = $1`,
      [payment.id],
    );
    await context.adminPool.query(
      `INSERT INTO payment_collection_operations
         (id, organization_id, payment_id, submission_idempotency_key,
          amount, currency, provider, state, dispatch_guarded_at, updated_at)
       VALUES ($1, $2, $3, $4, 10, 'JOD', 'provider-a', 'OUTCOME_UNKNOWN',
               transaction_timestamp(), transaction_timestamp())`,
      [operationId, fixture.organizationId, payment.id, randomUUID()],
    );
    const authenticator: ProviderEventAuthenticator = {
      authenticateAndNormalize: async (raw) => raw,
    };
    const ingress = createProviderEventIngress(
      context.runtimePool,
      authenticator,
    );
    const blocker = await context.adminPool.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query(`SELECT id FROM payments WHERE id = $1 FOR UPDATE`, [
        payment.id,
      ]);
      const provider = settled(
        ingress({
          binding: {
            organizationId: fixture.organizationId,
            provider: "provider-a",
          },
          event: {
            kind: "COLLECTION_SUCCEEDED",
            operationId,
            providerEventId: randomUUID(),
            providerReference: `reference-${randomUUID()}`,
            safeResultCode: "SUCCEEDED",
            subject: "COLLECTION",
          },
        }),
      );
      await waitForWaiters("FROM payments", 1);
      const completion = settled(context.complete(fixture));
      await waitForWaiters("FROM payments", 2);
      await blocker.query("COMMIT");
      await expect(provider).resolves.toMatchObject({
        kind: "FULFILLED",
        value: { processingStatus: "PROCESSED" },
      });
      await expect(completion).resolves.toMatchObject({
        kind: "FULFILLED",
        value: { state: "COMPLETED" },
      });
    } finally {
      await blocker.query("ROLLBACK");
      blocker.release();
    }
  });

  it.each(["INITIALIZE_FIRST", "RELEASE_FIRST"] as const)(
    "serializes missing Payment with concurrent $case",
    async (order) => {
      const fixture = await context.prepareStandard("PICKUP_CODE");
      await configure(fixture, "0.000");
      const blocker = await context.adminPool.connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(
          `SELECT id FROM valet_sessions WHERE id = $1 FOR UPDATE`,
          [fixture.sessionId],
        );
        const first =
          order === "INITIALIZE_FIRST"
            ? settled(initialize(fixture.sessionId))
            : settled(context.complete(fixture));
        await waitForWaiters("FROM valet_sessions", 1);
        const second =
          order === "INITIALIZE_FIRST"
            ? settled(context.complete(fixture))
            : settled(initialize(fixture.sessionId));
        await waitForWaiters("FROM valet_sessions", 2);
        await blocker.query("COMMIT");
        const [firstResult, secondResult] = await Promise.all([first, second]);
        if (order === "INITIALIZE_FIRST") {
          expect(firstResult).toMatchObject({
            kind: "FULFILLED",
            value: { status: "NOT_REQUIRED" },
          });
          expect(secondResult).toMatchObject({
            kind: "FULFILLED",
            value: { state: "COMPLETED" },
          });
        } else {
          expect(firstResult).toMatchObject({
            error: { code: "FINANCIAL_RELEASE_NOT_SATISFIED" },
            kind: "REJECTED",
          });
          expect(secondResult).toMatchObject({
            kind: "FULFILLED",
            value: { status: "NOT_REQUIRED" },
          });
          expect(
            (await context.releaseEffects(fixture)).projection.session_state,
          ).toBe("HANDOFF_PENDING");
        }
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
    },
  );
});
