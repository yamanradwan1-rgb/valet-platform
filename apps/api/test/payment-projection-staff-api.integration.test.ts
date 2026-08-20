import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  PaymentApiTestContext,
  type PaymentStaffCredentials,
} from "./payment-api-test-context";
import type { PaymentFixture } from "./payment-test-context";
import type { TestRole } from "./shift-test-context";

const context = new PaymentApiTestContext("projection_staff");

beforeAll(() => context.setupApi(), 120_000);
afterAll(() => context.teardownApi(), 60_000);

async function fixture(releaseRequiresPayment = true) {
  return context.createPaymentFixture({
    organizationFee: "10.000",
    organizationRelease: releaseRequiresPayment,
  });
}

function path(target: PaymentFixture) {
  return `/v1/staff/valet-sessions/${target.sessionId}/payment`;
}

async function auditCount(sessionId: string) {
  const result = await context.adminPool.query<{ count: number }>(
    `SELECT count(*)::integer AS count FROM audit_events
     WHERE valet_session_id = $1`,
    [sessionId],
  );
  return result.rows[0]!.count;
}

async function authorization(
  target: PaymentFixture,
  role: TestRole,
): Promise<{ header: string; staff: PaymentStaffCredentials }> {
  const staff = await context.createStaff(target, role);
  const login = await context.login(staff);
  expect(login.status).toBe(200);
  return { header: `Bearer ${String(login.body?.accessToken)}`, staff };
}

async function addHistory(target: PaymentFixture) {
  const payment = await context.initialize(target);
  const refundId = randomUUID();
  await context.adminPool.query(
    `UPDATE payments
     SET status = 'PAID', amount_paid = amount_due,
         paid_at = '2026-08-20T10:00:00Z', collection_method = 'DIGITAL',
         provider = 'private-provider', provider_reference = 'private-reference',
         updated_at = '2026-08-20T10:01:00Z'
     WHERE id = $1`,
    [payment.id],
  );
  await context.adminPool.query(
    `INSERT INTO refunds
       (id, organization_id, payment_id, amount, reason, status,
        authorized_by_membership_id, idempotency_key, provider,
        requested_at, completed_at)
     VALUES ($1, $2, $3, 1, 'private reason', 'PENDING', $4, $5,
             'private-provider', '2026-08-20T11:00:00Z', NULL)`,
    [
      refundId,
      target.organizationId,
      payment.id,
      target.membershipId,
      randomUUID(),
    ],
  );
  return { paymentId: payment.id, refundId };
}

describe("VAL-008G staff Payment projection API", () => {
  it("allows manager without Shift and active-shift Employee/Supervisor", async () => {
    for (const role of [
      "LOCATION_MANAGER",
      "VALET_EMPLOYEE",
      "VALET_SUPERVISOR",
    ] as const) {
      const target = await fixture(false);
      const auth = await authorization(target, role);
      if (role !== "LOCATION_MANAGER") {
        await createStartShiftCommandExecutor(context.runtimePool)({
          authenticatedUserId: auth.staff.userId,
          targetLocationId: target.locationId,
        });
      }
      const result = await context.request("GET", path(target), {
        authorization: auth.header,
      });
      expect(result).toMatchObject({
        body: { payment: null, releaseSatisfied: true },
        status: 200,
      });
    }
  });

  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR", "ORG_ADMIN"] as const)(
    "denies %s without accepted projection authority",
    async (role) => {
      const target = await fixture(false);
      const auth = await authorization(target, role);
      const result = await context.request("GET", path(target), {
        authorization: auth.header,
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

  it("denies an inactive Membership", async () => {
    const target = await fixture(false);
    const auth = await authorization(target, "LOCATION_MANAGER");
    await context.adminPool.query(
      `UPDATE organization_memberships SET status = 'INACTIVE'
       WHERE id = $1`,
      [auth.staff.membershipId],
    );
    const result = await context.request("GET", path(target), {
      authorization: auth.header,
    });
    expect(result).toMatchObject({
      body: { code: "AUTHORIZATION_DENIED" },
      status: 404,
    });
  });

  it("returns only accepted staff identifiers and Payment updatedAt", async () => {
    const target = await fixture();
    const ids = await addHistory(target);
    const auth = await authorization(target, "LOCATION_MANAGER");
    const before = await context.effects(target.sessionId);
    const beforeAudits = await auditCount(target.sessionId);
    const result = await context.request("GET", path(target), {
      authorization: auth.header,
    });
    expect(result).toMatchObject({
      body: {
        payment: {
          paymentId: ids.paymentId,
          updatedAt: "2026-08-20T10:01:00.000Z",
        },
        refunds: [{ refundId: ids.refundId }],
      },
      status: 200,
    });
    const serialized = JSON.stringify(result.body);
    for (const forbidden of [
      target.organizationId,
      target.locationId,
      "private reason",
      "private-provider",
      "private-reference",
      "idempotencyKey",
      "authorizedByMembershipId",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(await context.effects(target.sessionId)).toEqual(before);
    expect(await auditCount(target.sessionId)).toBe(beforeAudits);
  });

  it("conceals wrong-Location and cross-tenant reads", async () => {
    const owned = await fixture(false);
    const auth = await authorization(owned, "LOCATION_MANAGER");
    const otherLocationId = await context.addLocation(owned);
    const wrongLocation = await context.addSession({
      ...owned,
      locationId: otherLocationId,
    });
    const foreign = await fixture(false);
    for (const target of [wrongLocation, foreign]) {
      const result = await context.request("GET", path(target), {
        authorization: auth.header,
      });
      expect(result).toMatchObject({
        body: { code: "AUTHORIZATION_DENIED" },
        status: 404,
      });
    }
  });
});
