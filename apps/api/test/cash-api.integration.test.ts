import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createStartShiftCommandExecutor } from "../src/modules/shifts/start-shift-command";
import {
  PaymentApiTestContext,
  type PaymentStaffCredentials,
} from "./payment-api-test-context";
import type { PaymentFixture } from "./payment-test-context";
import type { TestRole } from "./shift-test-context";

const context = new PaymentApiTestContext("cash");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function fixture() {
  const created = await context.createPaymentFixture({
    organizationFee: "10.000",
  });
  await context.initialize(created);
  return created;
}

async function authenticate(
  payment: PaymentFixture,
  role: TestRole,
): Promise<{ authorization: string; credentials: PaymentStaffCredentials }> {
  const credentials = await context.createStaff(payment, role);
  const login = await context.login(credentials);
  expect(login.status).toBe(200);
  return {
    authorization: `Bearer ${String(login.body?.accessToken)}`,
    credentials,
  };
}

function path(payment: PaymentFixture, suffix: string) {
  return `/v1/staff/valet-sessions/${payment.sessionId}/payment/${suffix}`;
}

async function startShift(
  payment: PaymentFixture,
  staff: PaymentStaffCredentials,
) {
  return createStartShiftCommandExecutor(context.runtimePool)({
    authenticatedUserId: staff.userId,
    targetLocationId: payment.locationId,
  });
}

function expectSafeCashResponse(body: Record<string, unknown> | undefined) {
  expect(body).toMatchObject({
    amountDue: "10.000",
    amountPaid: expect.any(String),
    cashEntryAmount: expect.any(String),
    cashEntryId: expect.any(String),
    currency: "JOD",
    occurredAt: expect.any(String),
    valetSessionId: expect.any(String),
  });
  for (const forbidden of [
    "organizationId",
    "locationId",
    "membershipId",
    "provider",
    "providerReference",
    "authorization",
    "reason",
  ]) {
    expect(body).not.toHaveProperty(forbidden);
  }
}

describe("VAL-008C production-composed cash HTTP boundary", () => {
  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR"] as const)(
    "authenticates and receives cash for an active same-Location %s",
    async (role) => {
      const payment = await fixture();
      const staff = await authenticate(payment, role);
      await startShift(payment, staff.credentials);
      const before = await context.sessionSnapshot(payment.sessionId);
      const result = await context.request(
        "POST",
        path(payment, "cash-receipt"),
        {
          authorization: staff.authorization,
          body: { submissionIdempotencyKey: randomUUID() },
        },
      );
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({
        amountPaid: "10.000",
        entryType: "RECEIPT",
        status: "PAID",
      });
      expectSafeCashResponse(result.body);
      expect(await context.sessionSnapshot(payment.sessionId)).toEqual(before);
    },
  );

  it("composes Manager receipt and append-only adjustment without a Shift", async () => {
    const payment = await fixture();
    const manager = await authenticate(payment, "LOCATION_MANAGER");
    const received = await context.request(
      "POST",
      path(payment, "cash-receipt"),
      {
        authorization: manager.authorization,
        body: { submissionIdempotencyKey: randomUUID() },
      },
    );
    expect(received.status).toBe(200);
    const adjusted = await context.request(
      "POST",
      path(payment, "cash-adjustments"),
      {
        authorization: manager.authorization,
        body: {
          amount: "2.000",
          entryType: "ADJUSTMENT_DECREASE",
          reason: "Correct recorded denomination count",
          submissionIdempotencyKey: randomUUID(),
        },
      },
    );
    expect(adjusted).toMatchObject({
      body: {
        amountPaid: "8.000",
        cashEntryAmount: "2.000",
        entryType: "ADJUSTMENT_DECREASE",
        status: "UNPAID",
      },
      status: 200,
    });
    expectSafeCashResponse(adjusted.body);
  });

  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR", "ORG_ADMIN"] as const)(
    "denies %s cash adjustment through real authentication",
    async (role) => {
      const payment = await fixture();
      const manager = await authenticate(payment, "LOCATION_MANAGER");
      await context.request("POST", path(payment, "cash-receipt"), {
        authorization: manager.authorization,
        body: { submissionIdempotencyKey: randomUUID() },
      });
      const actor = await authenticate(payment, role);
      const denied = await context.request(
        "POST",
        path(payment, "cash-adjustments"),
        {
          authorization: actor.authorization,
          body: {
            amount: "1.000",
            entryType: "ADJUSTMENT_DECREASE",
            reason: "Unauthorized correction proof",
            submissionIdempotencyKey: randomUUID(),
          },
        },
      );
      expect(denied).toMatchObject({
        body: { code: "AUTHORIZATION_DENIED" },
        status: 404,
      });
    },
  );

  it("denies missing Shift, ORG_ADMIN, wrong Location, and cross-tenant targets without disclosure", async () => {
    const payment = await fixture();
    const employee = await authenticate(payment, "VALET_EMPLOYEE");
    const admin = await authenticate(payment, "ORG_ADMIN");
    const manager = await authenticate(payment, "LOCATION_MANAGER");
    const secondLocationId = await context.addLocation(payment);
    const wrongLocation = await context.addSession({
      ...payment,
      locationId: secondLocationId,
    });
    await context.initialize(wrongLocation);
    const foreign = await fixture();
    for (const [authorization, target] of [
      [employee.authorization, payment],
      [admin.authorization, payment],
      [employee.authorization, wrongLocation],
      [manager.authorization, wrongLocation],
      [employee.authorization, foreign],
    ] as const) {
      const denied = await context.request(
        "POST",
        path(target, "cash-receipt"),
        {
          authorization,
          body: { submissionIdempotencyKey: randomUUID() },
        },
      );
      expect(denied).toMatchObject({
        body: {
          code: "AUTHORIZATION_DENIED",
          message: "The requested resource is not available.",
        },
        status: 404,
      });
    }
  });

  it("rejects missing, malformed, duplicate Authorization and strict-body violations", async () => {
    const payment = await fixture();
    const manager = await authenticate(payment, "LOCATION_MANAGER");
    const receiptPath = path(payment, "cash-receipt");
    const body = { submissionIdempotencyKey: randomUUID() };
    const results = [
      await context.request("POST", receiptPath, { body }),
      await context.request("POST", receiptPath, {
        authorization: "Bearer malformed",
        body,
      }),
      await context.duplicateAuthorization(
        "POST",
        receiptPath,
        manager.authorization,
        body,
      ),
    ];
    for (const result of results) {
      expect(result).toMatchObject({
        body: { code: "STAFF_AUTHENTICATION_REQUIRED" },
        status: 401,
      });
    }
    const invalid = await context.request("POST", receiptPath, {
      authorization: manager.authorization,
      body: { ...body, amount: "10.000" },
    });
    expect(invalid).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
  });

  it("maps a non-collectible Payment to a safe financial conflict", async () => {
    const payment = await context.createPaymentFixture();
    await context.initialize(payment);
    const manager = await authenticate(payment, "LOCATION_MANAGER");
    const result = await context.request(
      "POST",
      path(payment, "cash-receipt"),
      {
        authorization: manager.authorization,
        body: { submissionIdempotencyKey: randomUUID() },
      },
    );
    expect(result).toMatchObject({
      body: {
        code: "CASH_COLLECTION_NOT_ALLOWED",
        message: "The cash receipt is not allowed.",
      },
      status: 409,
    });
    expect(JSON.stringify(result.body)).not.toMatch(
      /sql|constraint|stack|provider/i,
    );
  });

  it("ends an authenticated operational Shift with only cashReported and returns reconciliation", async () => {
    const payment = await fixture();
    const employee = await authenticate(payment, "VALET_EMPLOYEE");
    const shift = await startShift(payment, employee.credentials);
    await context.request("POST", path(payment, "cash-receipt"), {
      authorization: employee.authorization,
      body: { submissionIdempotencyKey: randomUUID() },
    });
    const ended = await context.request(
      "POST",
      `/v1/staff/shifts/${shift.shiftId}/end`,
      {
        authorization: employee.authorization,
        body: { cashReported: "9.000" },
      },
    );
    expect(ended).toMatchObject({
      body: {
        cashReconciliation: {
          cashExpected: "10.000",
          cashReported: "9.000",
          cashVariance: "-1.000",
          currency: "JOD",
        },
        status: "ENDED",
      },
      status: 200,
    });
    expect(ended.body).not.toHaveProperty("cashExpected");
    expect(ended.body).not.toHaveProperty("membershipId");
  });
});
