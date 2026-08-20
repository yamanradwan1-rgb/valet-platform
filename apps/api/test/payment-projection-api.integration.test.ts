import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  PaymentApiTestContext,
  type PaymentHttpResult,
} from "./payment-api-test-context";
import type { PaymentFixture } from "./payment-test-context";

const context = new PaymentApiTestContext("projection");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function fixture(releaseRequiresPayment = true) {
  const paymentFixture = await context.createPaymentFixture({
    organizationFee: "10.000",
    organizationRelease: releaseRequiresPayment,
    organizationValidation: true,
  });
  return paymentFixture;
}

function guestPath(target: PaymentFixture) {
  return `/v1/guest/valet-sessions/${target.sessionId}/payment`;
}

async function addProjectionHistory(target: PaymentFixture) {
  const payment = await context.initialize(target);
  const manager = await context.actor(target, "LOCATION_MANAGER");
  await context.validation(target, manager, {
    amount: "2.000",
    mode: "PARTIAL",
  });
  await context.managerTip(target, manager, "2.000");
  const refundStem = randomUUID().slice(0, -1);
  const refundIds = [`${refundStem}1`, `${refundStem}2`, `${refundStem}3`];
  await context.adminPool.query(
    `UPDATE payments
     SET status = 'PAID', amount_paid = amount_due, paid_at = $2,
         collection_method = 'CASH', updated_at = $3
     WHERE id = $1`,
    [
      payment.id,
      new Date("2026-08-20T10:00:00Z"),
      new Date("2026-08-20T10:01:00Z"),
    ],
  );
  const refunds = [
    {
      completedAt: null,
      id: refundIds[2]!,
      provider: "safe-provider-a",
      requestedAt: new Date("2026-08-20T11:00:00Z"),
      status: "PENDING",
    },
    {
      completedAt: new Date("2026-08-20T12:00:00Z"),
      id: refundIds[0]!,
      provider: null,
      requestedAt: new Date("2026-08-20T11:00:00Z"),
      status: "SUCCEEDED",
    },
    {
      completedAt: null,
      id: refundIds[1]!,
      provider: "safe-provider-b",
      requestedAt: new Date("2026-08-20T11:00:00Z"),
      status: "FAILED",
    },
  ] as const;
  for (const refund of refunds) {
    await context.adminPool.query(
      `INSERT INTO refunds
         (id, organization_id, payment_id, amount, reason, status,
          authorized_by_membership_id, idempotency_key, provider,
          requested_at, completed_at)
       VALUES ($1, $2, $3, 1, 'private reason', $4, $5, $6, $7, $8, $9)`,
      [
        refund.id,
        target.organizationId,
        payment.id,
        refund.status,
        target.membershipId,
        randomUUID(),
        refund.provider,
        refund.requestedAt,
        refund.completedAt,
      ],
    );
  }
  return { paymentId: payment.id, refundIds };
}

function expectNoStore(result: PaymentHttpResult) {
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("pragma")).toBe("no-cache");
}

async function auditCount(sessionId: string) {
  const result = await context.adminPool.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM audit_events
     WHERE valet_session_id = $1`,
    [sessionId],
  );
  return result.rows[0]!.count;
}

describe("VAL-008G safe Payment projection APIs", () => {
  it("returns the exact Guest-safe projection in deterministic Refund order", async () => {
    const target = await fixture();
    const { paymentId, refundIds } = await addProjectionHistory(target);
    const token = await context.guestToken(target);
    const before = await context.effects(target.sessionId);
    const beforeAudits = await auditCount(target.sessionId);
    const result = await context.request("GET", guestPath(target), {
      authorization: `Bearer ${token}`,
    });
    expect(result).toMatchObject({
      body: {
        payment: {
          amountDue: "10.000",
          amountPaid: "10.000",
          collectionMethod: "CASH",
          currency: "JOD",
          currentValidation: { amount: "2.000", mode: "PARTIAL" },
          paidAt: "2026-08-20T10:00:00.000Z",
          serviceAmount: "10.000",
          servicePayer: "CUSTOMER",
          status: "PAID",
          tipAmount: "2.000",
        },
        releaseRequiresPayment: true,
        releaseSatisfied: true,
      },
      status: 200,
    });
    expect(result.body?.refunds).toEqual([
      {
        amount: "1.000",
        completedAt: "2026-08-20T12:00:00.000Z",
        requestedAt: "2026-08-20T11:00:00.000Z",
        status: "SUCCEEDED",
      },
      {
        amount: "1.000",
        completedAt: null,
        requestedAt: "2026-08-20T11:00:00.000Z",
        status: "FAILED",
      },
      {
        amount: "1.000",
        completedAt: null,
        requestedAt: "2026-08-20T11:00:00.000Z",
        status: "PENDING",
      },
    ]);
    const serialized = JSON.stringify(result.body);
    for (const forbidden of [
      paymentId,
      refundIds[0]!,
      target.organizationId,
      target.locationId,
      "private reason",
      "safe-provider",
      "idempotency",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expectNoStore(result);
    expect(await context.effects(target.sessionId)).toEqual(before);
    expect(await auditCount(target.sessionId)).toBe(beforeAudits);
  });

  it("conceals invalid, expired, and cross-session Guest access", async () => {
    const owned = await fixture(false);
    const foreign = await fixture(false);
    const revokedTarget = await fixture(false);
    const token = await context.guestToken(owned);
    const revokedToken = await context.guestToken(revokedTarget);
    const invalid = await context.request("GET", guestPath(owned), {
      authorization: `Bearer ${"Z".repeat(43)}`,
    });
    const crossSession = await context.request("GET", guestPath(foreign), {
      authorization: `Bearer ${token}`,
    });
    await context.adminPool.query(
      `UPDATE valet_sessions SET customer_access_revoked_at = transaction_timestamp()
       WHERE id = $1`,
      [revokedTarget.sessionId],
    );
    const revoked = await context.request("GET", guestPath(revokedTarget), {
      authorization: `Bearer ${revokedToken}`,
    });
    await context.adminPool.query(
      `UPDATE valet_sessions
       SET customer_access_expires_at = transaction_timestamp() - interval '1 second'
       WHERE id = $1`,
      [owned.sessionId],
    );
    const expired = await context.request("GET", guestPath(owned), {
      authorization: `Bearer ${token}`,
    });
    for (const result of [invalid, crossSession, revoked, expired]) {
      expect(result).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
      expectNoStore(result);
    }
  });

  it("represents absent Payment without initializing it", async () => {
    for (const releaseRequiresPayment of [false, true]) {
      const target = await fixture(releaseRequiresPayment);
      const token = await context.guestToken(target);
      const result = await context.request("GET", guestPath(target), {
        authorization: `Bearer ${token}`,
      });
      expect(result).toMatchObject({
        body: {
          payment: null,
          refunds: [],
          releaseRequiresPayment,
          releaseSatisfied: !releaseRequiresPayment,
        },
        status: 200,
      });
      expect((await context.effects(target.sessionId)).payments).toHaveLength(
        0,
      );
    }
  });
});
