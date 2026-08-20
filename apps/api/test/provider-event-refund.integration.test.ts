import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ProviderEventTestContext,
  TestProviderEventAuthenticator,
} from "./provider-event-test-context";

const context = new ProviderEventTestContext("refund");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function ingressFor(normalized: unknown) {
  const authenticator = new TestProviderEventAuthenticator();
  authenticator.handler = async () => normalized;
  return context.ingress(authenticator);
}

async function paidFixture() {
  const fixture = await context.fixture();
  const { operation } = await context.referencedOperation(fixture);
  await ingressFor(
    context.collectionEvent(fixture, operation.id, "COLLECTION_SUCCEEDED"),
  )({});
  return fixture;
}

function refundEvent(
  fixture: Awaited<ReturnType<typeof paidFixture>>,
  refundId: string,
  kind: "REFUND_SUCCEEDED" | "REFUND_FAILED",
  overrides: Record<string, unknown> = {},
) {
  return {
    binding: context.binding(fixture),
    event: {
      kind,
      providerEventId: randomUUID(),
      providerReference: "refund-reference",
      refundId,
      safeResultCode: null,
      ...overrides,
    },
  };
}

describe("VAL-008E existing Refund reconciliation", () => {
  it("reconciles an existing PENDING digital Refund success", async () => {
    const fixture = await paidFixture();
    const refundId = await context.insertPendingRefund(fixture);
    const paymentBefore = (await context.providerEffects(fixture)).payment;

    const result = await ingressFor(
      refundEvent(fixture, refundId, "REFUND_SUCCEEDED"),
    )({});
    const effects = await context.providerEffects(fixture);
    expect(result.processingStatus).toBe("PROCESSED");
    expect(effects.refunds[0]).toMatchObject({
      completed_at: expect.any(Date),
      provider_reference: "refund-reference",
      status: "SUCCEEDED",
    });
    expect(effects.payment).toEqual(paymentBefore);
    expect(effects.audits.at(-1)?.event_type).toBe(
      "PROVIDER_EVENT_REFUND_SUCCEEDED",
    );
  });

  it("reconciles definitive Refund failure without rewriting Payment", async () => {
    const fixture = await paidFixture();
    const refundId = await context.insertPendingRefund(fixture);
    const paymentBefore = (await context.providerEffects(fixture)).payment;

    await ingressFor(refundEvent(fixture, refundId, "REFUND_FAILED"))({});
    const effects = await context.providerEffects(fixture);
    expect(effects.refunds[0]).toMatchObject({
      completed_at: null,
      provider_reference: "refund-reference",
      status: "FAILED",
    });
    expect(effects.payment).toEqual(paymentBefore);
  });

  it.each([
    [
      "wrong provider",
      { provider: "provider-b", reference: "refund-reference" },
    ],
    [
      "wrong reference",
      { provider: "provider-a", reference: "wrong-reference" },
    ],
  ])("ignores %s without mutating Refund or Payment", async (_, mismatch) => {
    const fixture = await paidFixture();
    const refundId = await context.insertPendingRefund(
      fixture,
      "persisted-refund-reference",
    );
    const before = await context.providerEffects(fixture);
    const event = refundEvent(fixture, refundId, "REFUND_SUCCEEDED", {
      providerReference: mismatch.reference,
    });
    event.binding = { ...event.binding, provider: mismatch.provider };

    const result = await ingressFor(event)({});
    const after = await context.providerEffects(fixture);
    expect(result.processingStatus).toBe("IGNORED");
    expect(after.refunds).toEqual(before.refunds);
    expect(after.payment).toEqual(before.payment);
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.audits).toEqual(before.audits);
  });

  it("deduplicates Refund event without a second transition or audit", async () => {
    const fixture = await paidFixture();
    const refundId = await context.insertPendingRefund(fixture);
    const event = refundEvent(fixture, refundId, "REFUND_SUCCEEDED");
    const ingress = ingressFor(event);

    const first = await ingress({});
    const duplicate = await ingress({});
    const effects = await context.providerEffects(fixture);
    expect(duplicate).toMatchObject({
      duplicate: true,
      eventId: first.eventId,
    });
    expect(
      effects.events.filter((row) => row.refund_id === refundId),
    ).toHaveLength(1);
    expect(
      effects.audits.filter(
        (row) => row.event_type === "PROVIDER_EVENT_REFUND_SUCCEEDED",
      ),
    ).toHaveLength(1);
  });

  it("persists a concurrent Refund reference collision as IGNORED", async () => {
    const first = await paidFixture();
    const second = await context.addSession(first);
    await context.initialize(second);
    const { operation } = await context.referencedOperation(
      second,
      `collection-${randomUUID()}`,
    );
    await ingressFor(
      context.collectionEvent(second, operation.id, "COLLECTION_SUCCEEDED", {
        providerReference: operation.providerReference,
      }),
    )({});
    const firstRefund = await context.insertPendingRefund(first);
    const secondRefund = await context.insertPendingRefund(second);
    const reference = `refund-collision-${randomUUID()}`;

    const results = await Promise.all([
      ingressFor(
        refundEvent(first, firstRefund, "REFUND_SUCCEEDED", {
          providerReference: reference,
        }),
      )({}),
      ingressFor(
        refundEvent(second, secondRefund, "REFUND_SUCCEEDED", {
          providerReference: reference,
        }),
      )({}),
    ]);
    const refunds = [
      ...(await context.providerEffects(first)).refunds,
      ...(await context.providerEffects(second)).refunds,
    ];
    expect(results.map((result) => result.processingStatus).sort()).toEqual([
      "IGNORED",
      "PROCESSED",
    ]);
    expect(
      refunds.filter((refund) => refund.status === "SUCCEEDED"),
    ).toHaveLength(1);
    expect(
      refunds.filter((refund) => refund.status === "PENDING"),
    ).toHaveLength(1);
  });

  it("does not persist or disclose a foreign-tenant Refund correlation", async () => {
    const owner = await paidFixture();
    const attacker = await paidFixture();
    const refundId = await context.insertPendingRefund(owner);
    const ownerBefore = await context.providerEffects(owner);
    const attackerBefore = await context.providerEffects(attacker);

    const result = await ingressFor(
      refundEvent(attacker, refundId, "REFUND_SUCCEEDED"),
    )({});
    expect(result).toMatchObject({
      persisted: false,
      processingStatus: "IGNORED",
    });
    expect(await context.providerEffects(owner)).toEqual(ownerBefore);
    expect(await context.providerEffects(attacker)).toEqual(attackerBefore);
  });
});
