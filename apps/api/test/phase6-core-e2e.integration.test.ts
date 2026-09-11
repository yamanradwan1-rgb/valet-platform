import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Phase6CoreE2ETestContext } from "./phase6-core-e2e-test-context";

describe("VAL-008H production-composed customer cash journey", () => {
  const context = new Phase6CoreE2ETestContext("customer_cash");

  beforeEach(async () => context.setupApi(), 120_000);
  afterEach(async () => context.teardownApi(), 60_000);

  it("collects, projects, releases, and refunds without rewriting collection history", async () => {
    const fixture = await context.prepareStandard("PICKUP_CODE");
    await context.configureCustomerCash(fixture);
    await context.initialize(fixture);
    const accessToken = await context.login(fixture);
    const staffAuthorization = `Bearer ${accessToken}`;
    const managerAuthorization = `Bearer ${await context.loginManager(fixture)}`;

    const receipt = await context.request(
      "POST",
      `/v1/staff/valet-sessions/${fixture.sessionId}/payment/cash-receipt`,
      {
        authorization: staffAuthorization,
        body: { submissionIdempotencyKey: randomUUID() },
      },
    );
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({
      amountDue: "5.000",
      amountPaid: "5.000",
      entryType: "RECEIPT",
      status: "PAID",
    });

    const staffProjection = await context.request(
      "GET",
      `/v1/staff/valet-sessions/${fixture.sessionId}/payment`,
      { authorization: staffAuthorization },
    );
    const guestProjection = await context.request(
      "GET",
      `/v1/guest/valet-sessions/${fixture.sessionId}/payment`,
      { authorization: `Bearer ${fixture.guestToken}` },
    );
    expect(staffProjection.status).toBe(200);
    expect(guestProjection.status).toBe(200);
    expect(staffProjection.body).toMatchObject({
      releaseRequiresPayment: true,
      releaseSatisfied: true,
      payment: { amountPaid: "5.000", status: "PAID" },
    });
    expect(guestProjection.body).toMatchObject({
      releaseRequiresPayment: true,
      releaseSatisfied: true,
      payment: { amountPaid: "5.000", status: "PAID" },
    });

    const release = await context.request(
      "POST",
      `/v1/staff/valet-sessions/${fixture.sessionId}/complete-handoff`,
      {
        authorization: staffAuthorization,
        body: { expectedSessionVersion: 9 },
      },
    );
    expect(release.status).toBe(200);
    expect(release.body).toMatchObject({ state: "COMPLETED" });

    const refund = await context.request(
      "POST",
      `/v1/staff/valet-sessions/${fixture.sessionId}/payment/refunds`,
      {
        authorization: managerAuthorization,
        body: {
          amount: "2.000",
          idempotencyKey: randomUUID(),
          reason: "Customer cash returned after release",
        },
      },
    );
    expect(refund.status).toBe(200);
    expect(refund.body).toMatchObject({
      amount: "2.000",
      currency: "JOD",
      status: "SUCCEEDED",
    });
    expect(await context.financialHistory(fixture)).toEqual({
      amount_paid: "5.000",
      cash_count: 1,
      payment_status: "PAID",
      refund_count: 1,
      session_state: "COMPLETED",
    });
  });
});
