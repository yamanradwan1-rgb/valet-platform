import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  PaymentApiTestContext,
  type PaymentHttpResult,
} from "./payment-api-test-context";
import type {
  FinancialPolicyOptions,
  PaymentFixture,
} from "./payment-test-context";
import type { TestRole } from "./shift-test-context";

const context = new PaymentApiTestContext("staff");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function paymentFixture(
  options: FinancialPolicyOptions = {},
): Promise<PaymentFixture> {
  const fixture = await context.createPaymentFixture({
    organizationFee: "10.000",
    organizationTips: true,
    organizationValidation: true,
    ...options,
  });
  await context.initialize(fixture);
  return fixture;
}

async function authenticated(
  fixture: PaymentFixture,
  role: TestRole = "LOCATION_MANAGER",
): Promise<{ authorization: string; login: PaymentHttpResult }> {
  const login = await context.login(await context.createStaff(fixture, role));
  return {
    authorization: `Bearer ${String(login.body?.accessToken)}`,
    login,
  };
}

function paymentPath(fixture: PaymentFixture, suffix: string): string {
  return `/v1/staff/valet-sessions/${fixture.sessionId}/payment/${suffix}`;
}

describe("VAL-008B production staff Payment HTTP boundary", () => {
  it("composes all four staff routes with real login and no session mutation", async () => {
    const cases = [
      {
        body: { mode: "FULL" },
        expected: { amountDue: "0.000", status: "NOT_REQUIRED" },
        method: "POST",
        suffix: "validation",
      },
      {
        body: { tipAmount: "2.000" },
        expected: { amountDue: "12.000", tipAmount: "2.000" },
        method: "PATCH",
        suffix: "tip",
      },
      {
        body: { servicePayer: "VENUE" },
        expected: { amountDue: "0.000", servicePayer: "VENUE" },
        method: "PATCH",
        suffix: "payer",
      },
      {
        body: { serviceAmount: "12.000" },
        expected: { amountDue: "12.000", serviceAmount: "12.000" },
        method: "PATCH",
        suffix: "service-amount",
      },
    ] as const;
    for (const testCase of cases) {
      const fixture = await paymentFixture();
      const before = await context.sessionSnapshot(fixture.sessionId);
      const auth = await authenticated(fixture);
      expect(auth.login).toMatchObject({ status: 200 });
      expect(auth.login.body?.accessToken).toEqual(expect.any(String));
      const result = await context.request(
        testCase.method,
        paymentPath(fixture, testCase.suffix),
        { authorization: auth.authorization, body: testCase.body },
      );
      expect(result).toMatchObject({
        body: testCase.expected,
        status: testCase.method === "POST" ? 201 : 200,
      });
      expect(result.body).not.toHaveProperty("organizationId");
      expect(result.body).not.toHaveProperty("provider");
      expect(await context.sessionSnapshot(fixture.sessionId)).toEqual(before);
      if (testCase.suffix === "validation") {
        expect(result.body?.currentValidation).toMatchObject({
          id: expect.any(String),
          mode: "FULL",
        });
      }
    }
  });

  it.each(["VALET_EMPLOYEE", "VALET_SUPERVISOR", "ORG_ADMIN"] as const)(
    "denies %s through the authenticated HTTP boundary",
    async (role) => {
      const fixture = await paymentFixture();
      const auth = await authenticated(fixture, role);
      expect(auth.login.status).toBe(200);
      const result = await context.request(
        "PATCH",
        paymentPath(fixture, "tip"),
        {
          authorization: auth.authorization,
          body: { tipAmount: "1.000" },
        },
      );
      expect(result).toMatchObject({
        body: {
          code: "AUTHORIZATION_DENIED",
          message: "The requested resource is not available.",
        },
        status: 404,
      });
    },
  );

  it("conceals wrong-Location and cross-tenant sessions", async () => {
    const owned = await paymentFixture();
    const auth = await authenticated(owned);
    expect(auth.login.status).toBe(200);
    const otherLocationId = await context.addLocation(owned);
    const wrongLocation = await context.addSession({
      ...owned,
      locationId: otherLocationId,
    });
    await context.initialize(wrongLocation);
    const foreign = await paymentFixture();
    for (const target of [wrongLocation, foreign]) {
      const result = await context.request(
        "PATCH",
        paymentPath(target, "tip"),
        {
          authorization: auth.authorization,
          body: { tipAmount: "1.000" },
        },
      );
      expect(result).toMatchObject({
        body: {
          code: "AUTHORIZATION_DENIED",
          message: "The requested resource is not available.",
        },
        status: 404,
      });
    }
  });

  it("rejects missing, malformed, and duplicate Authorization", async () => {
    const fixture = await paymentFixture();
    const auth = await authenticated(fixture);
    expect(auth.login.status).toBe(200);
    const path = paymentPath(fixture, "tip");
    const missing = await context.request("PATCH", path, {
      body: { tipAmount: "1.000" },
    });
    const malformed = await context.request("PATCH", path, {
      authorization: "Bearer malformed",
      body: { tipAmount: "1.000" },
    });
    const duplicate = await context.duplicateAuthorization(
      "PATCH",
      path,
      auth.authorization,
      { tipAmount: "1.000" },
    );
    for (const result of [missing, malformed, duplicate]) {
      expect(result).toMatchObject({
        body: { code: "STAFF_AUTHENTICATION_REQUIRED" },
        status: 401,
      });
    }
  });

  it("strictly rejects unknown fields on every staff route", async () => {
    const fixture = await paymentFixture();
    const auth = await authenticated(fixture);
    expect(auth.login.status).toBe(200);
    const cases = [
      ["POST", "validation", { mode: "FULL", provider: "forbidden" }],
      ["PATCH", "tip", { currency: "USD", tipAmount: "1.000" }],
      ["PATCH", "payer", { servicePayer: "VENUE", status: "PAID" }],
      [
        "PATCH",
        "service-amount",
        { amountPaid: "1.000", serviceAmount: "2.000" },
      ],
    ] as const;
    for (const [method, suffix, body] of cases) {
      const result = await context.request(
        method,
        paymentPath(fixture, suffix),
        {
          authorization: auth.authorization,
          body,
        },
      );
      expect(result).toMatchObject({
        body: { code: "REQUEST_INVALID" },
        status: 400,
      });
    }
  });

  it("maps financial failures safely without operational mutation", async () => {
    const fixture = await paymentFixture({ organizationValidation: false });
    const before = await context.sessionSnapshot(fixture.sessionId);
    const auth = await authenticated(fixture);
    expect(auth.login.status).toBe(200);
    const result = await context.request(
      "POST",
      paymentPath(fixture, "validation"),
      { authorization: auth.authorization, body: { mode: "FULL" } },
    );
    expect(result).toMatchObject({
      body: {
        code: "PAYMENT_VALIDATION_DISABLED",
        message: "Validation is not enabled for this location.",
      },
      status: 409,
    });
    expect(result.body).not.toHaveProperty("detail");
    expect(await context.sessionSnapshot(fixture.sessionId)).toEqual(before);
  });
});
