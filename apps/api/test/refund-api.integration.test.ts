import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PaymentApiTestContext } from "./payment-api-test-context";
import type { PaymentFixture } from "./payment-test-context";
import type { TestRole } from "./shift-test-context";

const context = new PaymentApiTestContext("refund");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function fixture(): Promise<PaymentFixture> {
  const created = await context.createPaymentFixture({ organizationFee: "10" });
  const payment = await context.initialize(created);
  await context.adminPool.query(
    `UPDATE payments
     SET amount_paid = amount_due, status = 'PAID',
         paid_at = transaction_timestamp(), updated_at = transaction_timestamp()
     WHERE id = $1`,
    [payment.id],
  );
  await context.adminPool.query(
    `INSERT INTO cash_entries
       (id, organization_id, payment_id, entry_type, amount,
        received_or_adjusted_by_membership_id, submission_idempotency_key,
        occurred_at)
     VALUES ($1, $2, $3, 'RECEIPT', 10, $4, $5,
             transaction_timestamp())`,
    [
      randomUUID(),
      created.organizationId,
      payment.id,
      created.membershipId,
      randomUUID(),
    ],
  );
  return created;
}

async function authorization(payment: PaymentFixture, role: TestRole) {
  const credentials = await context.createStaff(payment, role);
  const login = await context.login(credentials);
  expect(login.status).toBe(200);
  return `Bearer ${String(login.body?.accessToken)}`;
}

function path(payment: PaymentFixture) {
  return `/v1/staff/valet-sessions/${payment.sessionId}/payment/refunds`;
}

describe("VAL-008F production-composed Refund HTTP boundary", () => {
  it("allows a Location Manager and returns a narrow projection", async () => {
    const payment = await fixture();
    const manager = await authorization(payment, "LOCATION_MANAGER");
    const result = await context.request("POST", path(payment), {
      authorization: manager,
      body: {
        amount: "2.000",
        idempotencyKey: randomUUID(),
        reason: "Customer recovery",
      },
    });
    expect(result).toMatchObject({
      body: {
        amount: "2.000",
        completedAt: expect.any(String),
        currency: "JOD",
        refundId: expect.any(String),
        requestedAt: expect.any(String),
        status: "SUCCEEDED",
      },
      status: 200,
    });
    for (const forbidden of [
      "authorizedByMembershipId",
      "organizationId",
      "paymentId",
      "provider",
      "providerReference",
      "reason",
    ]) {
      expect(result.body).not.toHaveProperty(forbidden);
    }
  });

  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR", "ORG_ADMIN"] as const)(
    "denies %s through real authentication",
    async (role) => {
      const payment = await fixture();
      const actor = await authorization(payment, role);
      const result = await context.request("POST", path(payment), {
        authorization: actor,
        body: {
          amount: "1.000",
          idempotencyKey: randomUUID(),
          reason: "Forbidden",
        },
      });
      expect(result).toMatchObject({
        body: {
          code: "AUTHORIZATION_DENIED",
          message: "The requested resource is not available.",
        },
        status: 404,
      });
    },
  );

  it("rejects caller-owned authority fields and malformed input", async () => {
    const payment = await fixture();
    const manager = await authorization(payment, "LOCATION_MANAGER");
    const result = await context.request("POST", path(payment), {
      authorization: manager,
      body: {
        amount: "1.000",
        authorizerMembershipId: randomUUID(),
        idempotencyKey: randomUUID(),
        provider: "attacker-provider",
        reason: "Attempted authority",
        status: "SUCCEEDED",
      },
    });
    expect(result).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
  });

  it("does not expose a guest Refund route", async () => {
    const payment = await fixture();
    const result = await context.request(
      "POST",
      `/v1/guest/valet-sessions/${payment.sessionId}/payment/refunds`,
      {
        body: {
          amount: "1.000",
          idempotencyKey: randomUUID(),
          reason: "Guest attempt",
        },
      },
    );
    expect(result.status).toBe(404);
  });
});
