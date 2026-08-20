import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ProviderEventTestContext,
  TestProviderEventAuthenticator,
} from "./provider-event-test-context";

const context = new ProviderEventTestContext("authentication");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-008E provider-event authenticity boundary", () => {
  it("writes nothing when authentication fails", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.unresolvedOperation(fixture);
    await context.insertPendingRefund(fixture);
    const authenticator = new TestProviderEventAuthenticator();
    authenticator.handler = async () => {
      throw new Error("invalid signature details must not escape");
    };
    const before = await context.providerEffects(fixture);

    await expect(
      context.ingress(authenticator)({
        raw: "secret",
        operationId: operation.id,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_EVENT_REJECTED" });

    expect(await context.providerEffects(fixture)).toEqual(before);
  });

  it("writes nothing when normalized output is malformed", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.unresolvedOperation(fixture);
    await context.insertPendingRefund(fixture);
    const authenticator = new TestProviderEventAuthenticator();
    authenticator.handler = async () => ({
      binding: context.binding(fixture),
      event: {
        kind: "COLLECTION_SUCCEEDED",
        operationId: operation.id,
        providerEventId: "x".repeat(401),
        providerReference: "event-reference",
        safeResultCode: "raw secret bearing message",
      },
    });
    const before = await context.providerEffects(fixture);

    await expect(context.ingress(authenticator)({})).rejects.toMatchObject({
      code: "PROVIDER_EVENT_REJECTED",
    });
    expect(await context.providerEffects(fixture)).toEqual(before);
  });

  it("does not let raw tenant, provider, amount, or currency choose authority", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.referencedOperation(fixture);
    const authenticator = new TestProviderEventAuthenticator();
    const normalized = context.collectionEvent(
      fixture,
      operation.id,
      "COLLECTION_SUCCEEDED",
    );
    authenticator.handler = async () => normalized;

    await context.ingress(authenticator)({
      amount: "999999.999",
      currency: "USD",
      organizationId: randomUUID(),
      provider: "attacker-provider",
      rawSecret: "must-not-persist",
    });

    const effects = await context.providerEffects(fixture);
    expect(effects.payment).toMatchObject({
      amount_due: "5.000",
      amount_paid: "5.000",
      currency: "JOD",
      provider: "provider-a",
      status: "PAID",
    });
    expect(JSON.stringify(effects)).not.toContain("must-not-persist");
    expect(JSON.stringify(effects)).not.toContain("999999.999");
    expect(JSON.stringify(effects)).not.toContain("attacker-provider");
  });
});
