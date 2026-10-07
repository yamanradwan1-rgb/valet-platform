import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GUEST_BROWSER_COOKIE } from "../src/modules/guest-access/guest-browser-transport";
import {
  PaymentApiTestContext,
  type PaymentHttpResult,
} from "./payment-api-test-context";
import type { PaymentFixture } from "./payment-test-context";

const context = new PaymentApiTestContext("guest");

beforeAll(() => context.setupApi(), 120_000);
beforeEach(() => context.clearAntiAbuse());
afterAll(() => context.teardownApi(), 60_000);

async function paymentFixture(
  options: {
    tips?: boolean;
    validation?: boolean;
  } = {},
): Promise<PaymentFixture> {
  const fixture = await context.createPaymentFixture({
    organizationFee: "10.000",
    organizationTips: options.tips ?? true,
    organizationValidation: options.validation ?? true,
  });
  await context.initialize(fixture);
  return fixture;
}

function expectNoStore(result: PaymentHttpResult): void {
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("pragma")).toBe("no-cache");
}

function guestTip(token: string, body: unknown): Promise<PaymentHttpResult> {
  return context.request("PATCH", "/v1/guest/payment/tip", {
    authorization: `Bearer ${token}`,
    body,
  });
}

async function browserCookie(fixture: PaymentFixture): Promise<string> {
  const token = await context.guestToken(fixture);
  await context.adminPool.query(
    `UPDATE valet_sessions
     SET customer_access_generation=1,customer_access_consumed_at=NULL
     WHERE id=$1`,
    [fixture.sessionId],
  );
  const enrollment = `vge1.${randomBytes(32).toString("base64url")}`;
  const browser = `vgb1.${randomBytes(32).toString("base64url")}`;
  await context.runtimePool.query("SELECT guest_browser_enroll($1,$2)", [
    enrollment,
    browser,
  ]);
  const exchanged = await context.runtimePool.query<{ result_code: string }>(
    "SELECT result_code FROM guest_browser_exchange($1,$2,$3)",
    [token, enrollment, browser],
  );
  expect(exchanged.rows[0]?.result_code).toBe("AUTHORIZED");
  return `${GUEST_BROWSER_COOKIE}=${browser}`;
}

describe("VAL-008B production Guest Payment HTTP boundary", () => {
  it("uses bearer ownership and returns only the Guest-safe projection", async () => {
    const owned = await paymentFixture();
    const foreign = await paymentFixture();
    const beforeSession = await context.sessionSnapshot(owned.sessionId);
    const foreignPaymentBefore = await context.payment(foreign.sessionId);
    const manager = await context.login(await context.createStaff(owned));
    expect(manager.status).toBe(200);
    const validation = await context.request(
      "POST",
      `/v1/staff/valet-sessions/${owned.sessionId}/payment/validation`,
      {
        authorization: `Bearer ${String(manager.body?.accessToken)}`,
        body: { amount: "4.000", mode: "PARTIAL" },
      },
    );
    expect(validation).toMatchObject({ status: 201 });
    const validationId = String(
      (validation.body?.currentValidation as { id?: unknown } | undefined)?.id,
    );
    expect(validationId).toMatch(/^[0-9a-f-]{36}$/i);
    const token = await context.guestToken(owned);
    const result = await guestTip(token, { tipAmount: "2.000" });
    expect(result).toMatchObject({
      body: {
        amountDue: "8.000",
        collectionMethod: "CASH",
        currency: "JOD",
        status: "UNPAID",
        tipAmount: "2.000",
        valetSessionId: owned.sessionId,
      },
      status: 200,
    });
    expect(Object.keys(result.body ?? {}).sort()).toEqual(
      [
        "amountDue",
        "collectionMethod",
        "currency",
        "status",
        "tipAmount",
        "valetSessionId",
      ].sort(),
    );
    expect(JSON.stringify(result.body)).not.toContain(validationId);
    for (const forbidden of [
      "currentValidation",
      "organizationId",
      "locationId",
      "membershipId",
      "provider",
      "providerReference",
      "serviceAmount",
      "servicePayer",
      "updatedAt",
    ]) {
      expect(result.body).not.toHaveProperty(forbidden);
    }
    expectNoStore(result);
    expect(await context.payment(foreign.sessionId)).toEqual(
      foreignPaymentBefore,
    );
    expect(await context.sessionSnapshot(owned.sessionId)).toEqual(
      beforeSession,
    );
  });

  it("rejects invalid and caller-selected foreign Guest scope", async () => {
    const owned = await paymentFixture();
    const foreign = await paymentFixture();
    const invalid = await guestTip("Z".repeat(43), { tipAmount: "1.000" });
    expect(invalid).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    expectNoStore(invalid);
    const token = await context.guestToken(owned);
    const selected = await guestTip(token, {
      tipAmount: "1.000",
      valetSessionId: foreign.sessionId,
    });
    expect(selected).toMatchObject({
      body: { code: "REQUEST_INVALID" },
      status: 400,
    });
    expectNoStore(selected);
    expect(await context.payment(owned.sessionId)).toMatchObject({
      tip_amount: "0.000",
    });
    expect(await context.payment(foreign.sessionId)).toMatchObject({
      tip_amount: "0.000",
    });
  });

  it("does not let a Browser Session select another visit through the path", async () => {
    const owned = await paymentFixture();
    const foreign = await paymentFixture();
    const cookie = await browserCookie(owned);
    const ownedRead = await context.request(
      "GET",
      `/v1/guest/valet-sessions/${owned.sessionId}/payment`,
      { headers: { Cookie: cookie } },
    );
    expect(ownedRead.status).toBe(200);
    const foreignRead = await context.request(
      "GET",
      `/v1/guest/valet-sessions/${foreign.sessionId}/payment`,
      { headers: { Cookie: cookie } },
    );
    expect(foreignRead).toMatchObject({
      body: { code: "GUEST_ACCESS_INVALID" },
      status: 401,
    });
    expectNoStore(foreignRead);
  });

  it("rejects missing, malformed, and duplicate Guest Authorization", async () => {
    const fixture = await paymentFixture();
    const token = await context.guestToken(fixture);
    const missing = await context.request("PATCH", "/v1/guest/payment/tip", {
      body: { tipAmount: "1.000" },
    });
    const malformed = await context.request("PATCH", "/v1/guest/payment/tip", {
      authorization: "Bearer malformed",
      body: { tipAmount: "1.000" },
    });
    const duplicate = await context.duplicateAuthorization(
      "PATCH",
      "/v1/guest/payment/tip",
      `Bearer ${token}`,
      { tipAmount: "1.000" },
    );
    for (const result of [missing, malformed, duplicate]) {
      expect(result).toMatchObject({
        body: { code: "GUEST_ACCESS_INVALID" },
        status: 401,
      });
      expectNoStore(result);
    }
  });

  it("composes production anti-abuse and no-store rate limiting", async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const denied = await context.request("PATCH", "/v1/guest/payment/tip", {
        body: { tipAmount: "1.000" },
      });
      expect(denied.status).toBe(401);
    }
    const limited = await context.request("PATCH", "/v1/guest/payment/tip", {
      body: { tipAmount: "1.000" },
    });
    expect(limited).toMatchObject({
      body: { code: "GUEST_ACCESS_RATE_LIMITED" },
      status: 429,
    });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expectNoStore(limited);
  });

  it("maps disabled-tip policy safely with no operational mutation", async () => {
    const fixture = await paymentFixture({ tips: false });
    const before = await context.sessionSnapshot(fixture.sessionId);
    const token = await context.guestToken(fixture);
    const result = await guestTip(token, { tipAmount: "1.000" });
    expect(result).toMatchObject({
      body: {
        code: "PAYMENT_TIPS_DISABLED",
        message: "Tips are not enabled for this location.",
      },
      status: 409,
    });
    expectNoStore(result);
    expect(result.body).not.toHaveProperty("currentValidation");
    expect(await context.sessionSnapshot(fixture.sessionId)).toEqual(before);
  });

  it("enforces USD minor units at the production Guest tip boundary", async () => {
    const fixture = await context.createPaymentFixture({
      currency: "USD",
      organizationFee: "10.00",
      organizationTips: true,
    });
    await context.initialize(fixture);
    const token = await context.guestToken(fixture);
    const before = await context.payment(fixture.sessionId);

    const rejected = await guestTip(token, { tipAmount: "1.201" });
    expect(rejected).toMatchObject({
      body: { code: "PAYMENT_AMOUNT_INVALID" },
      status: 400,
    });
    expectNoStore(rejected);
    expect(await context.payment(fixture.sessionId)).toEqual(before);

    const accepted = await guestTip(token, { tipAmount: "1.200" });
    expect(accepted).toMatchObject({
      body: { amountDue: "11.200", currency: "USD", tipAmount: "1.200" },
      status: 200,
    });
    expectNoStore(accepted);
  });
});
