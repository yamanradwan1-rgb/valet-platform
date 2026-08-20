import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DigitalCollectionTestContext,
  expectDigitalError,
  TestDigitalProvider,
  TestDigitalProviderRegistry,
} from "./digital-collection-test-context";

const context = new DigitalCollectionTestContext("initiation");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-008D digital collection initiation", () => {
  it("persists canonical PREPARED facts before provider invocation", async () => {
    const fixture = await context.fixture();
    const registry = new TestDigitalProviderRegistry();
    const provider = new TestDigitalProvider();
    registry.adapters.set("provider-a", provider);
    provider.handler = async (input) => {
      const persisted = await context.adminPool.query(
        `SELECT state::text, amount::text, currency, provider
         FROM payment_collection_operations WHERE id = $1`,
        [input.operationId],
      );
      expect(persisted.rows[0]).toMatchObject({
        amount: "5.000",
        currency: "JOD",
        provider: "provider-a",
        state: "OUTCOME_UNKNOWN",
      });
      return {
        kind: "REFERENCE_ATTACHED",
        providerReference: "reference-a",
        safeResultCode: "ACCEPTED",
      };
    };

    const result = await context.collect(fixture, randomUUID(), registry);

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(provider.calls).toEqual([
      { amount: "5.000", currency: "JOD", operationId: result.id },
    ]);
    const effects = await context.collectionEffects(fixture);
    expect(effects.payment).toMatchObject({
      amount_paid: "0.000",
      collection_method: "DIGITAL",
      paid_at: null,
      provider: "provider-a",
      provider_reference: "reference-a",
      status: "UNPAID",
    });
    expect(effects.audits.map((row) => row.event_type)).toEqual([
      "PAYMENT_COLLECTION_PREPARED",
      "PAYMENT_COLLECTION_DISPATCH_GUARDED",
      "PAYMENT_COLLECTION_REFERENCE_ATTACHED",
    ]);
  });

  it("fails closed before writes when no provider binding exists", async () => {
    const fixture = await context.fixture();
    const registry = new TestDigitalProviderRegistry();
    registry.configuredProvider = null;
    await expectDigitalError(
      context.collect(fixture, randomUUID(), registry),
      "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE",
    );
    const effects = await context.collectionEffects(fixture);
    expect(effects.operations).toEqual([]);
    expect(effects.audits).toEqual([]);
    expect(effects.payment).toMatchObject({
      collection_method: "CASH",
      provider: null,
      status: "UNPAID",
    });
  });

  it("fails closed before writes when the configured adapter is unavailable", async () => {
    const fixture = await context.fixture();
    const registry = new TestDigitalProviderRegistry();
    await expectDigitalError(
      context.collect(fixture, randomUUID(), registry),
      "DIGITAL_PAYMENT_PROVIDER_UNAVAILABLE",
    );
    const effects = await context.collectionEffects(fixture);
    expect(effects.operations).toEqual([]);
    expect(effects.audits).toEqual([]);
    expect(effects.payment).toMatchObject({
      collection_method: "CASH",
      provider: null,
      status: "UNPAID",
    });
  });

  it.each([
    ["malformed session ID", "not-a-uuid", randomUUID()],
    ["oversized submission key", null, "x".repeat(201)],
  ])(
    "rejects %s before database or provider effects",
    async (_, sessionId, key) => {
      const fixture = await context.fixture();
      const registry = new TestDigitalProviderRegistry();
      const provider = new TestDigitalProvider();
      registry.adapters.set("provider-a", provider);
      const requestFixture =
        sessionId === null ? fixture : { ...fixture, sessionId };
      await expectDigitalError(
        context.collect(requestFixture, key, registry),
        "DIGITAL_COLLECTION_STATE_CONFLICT",
      );
      expect(provider.calls).toEqual([]);
      expect((await context.collectionEffects(fixture)).operations).toEqual([]);
    },
  );

  it("resumes the same key using historical provider binding", async () => {
    const fixture = await context.fixture();
    const registry = new TestDigitalProviderRegistry();
    const providerA = new TestDigitalProvider();
    const providerB = new TestDigitalProvider();
    registry.adapters.set("provider-a", providerA);
    registry.adapters.set("provider-b", providerB);
    const key = randomUUID();
    const first = await context.collect(fixture, key, registry);
    registry.configuredProvider = "provider-b";
    await context.adminPool.query(
      `UPDATE organizations SET payment_methods_policy = 'CASH_ONLY'
       WHERE id = $1`,
      [fixture.organizationId],
    );
    const retry = await context.collect(fixture, key, registry);
    expect(retry).toEqual(first);
    expect(providerA.calls).toHaveLength(1);
    expect(providerB.calls).toHaveLength(0);
  });

  it("rejects same tenant key reuse for a different Payment", async () => {
    const first = await context.fixture();
    const second = await context.addSession(first);
    await context.initialize(second);
    const registry = new TestDigitalProviderRegistry();
    registry.adapters.set("provider-a", new TestDigitalProvider());
    const key = randomUUID();
    await context.collect(first, key, registry);
    await expectDigitalError(
      context.collect(second, key, registry),
      "DIGITAL_COLLECTION_IDEMPOTENCY_CONFLICT",
    );
    expect((await context.collectionEffects(second)).operations).toEqual([]);
  });

  it("rejects a different key while an unresolved operation exists", async () => {
    const fixture = await context.fixture();
    const registry = new TestDigitalProviderRegistry();
    registry.adapters.set("provider-a", new TestDigitalProvider());
    await context.collect(fixture, randomUUID(), registry);
    await expectDigitalError(
      context.collect(fixture, randomUUID(), registry),
      "DIGITAL_COLLECTION_OPERATION_IN_PROGRESS",
    );
  });

  it("prioritizes unresolved history over current provider unavailability", async () => {
    const fixture = await context.fixture();
    const registry = new TestDigitalProviderRegistry();
    const provider = new TestDigitalProvider();
    registry.adapters.set("provider-a", provider);
    const original = await context.collect(fixture, randomUUID(), registry);
    const beforeRetry = await context.collectionEffects(fixture);

    registry.configuredProvider = null;
    await expectDigitalError(
      context.collect(fixture, randomUUID(), registry),
      "DIGITAL_COLLECTION_OPERATION_IN_PROGRESS",
    );

    const afterRetry = await context.collectionEffects(fixture);
    expect(original.state).toBe("OUTCOME_UNKNOWN");
    expect(provider.calls).toHaveLength(1);
    expect(afterRetry.operations).toEqual(beforeRetry.operations);
  });

  it("blocks fresh digital initiation after cash collection started", async () => {
    const fixture = await context.fixture();
    const payment = await context.payment(fixture.sessionId);
    await context.addCashEvidence(fixture, payment.id);
    const registry = new TestDigitalProviderRegistry();
    await expectDigitalError(
      context.collect(fixture, randomUUID(), registry),
      "DIGITAL_COLLECTION_STATE_CONFLICT",
    );
    expect((await context.collectionEffects(fixture)).operations).toEqual([]);
  });

  it("blocks fresh initiation when committed provider-event evidence exists", async () => {
    const fixture = await context.fixture();
    const payment = await context.payment(fixture.sessionId);
    await context.adminPool.query(
      `INSERT INTO payment_provider_events
         (id, organization_id, payment_id, provider, provider_event_id,
          processing_status, received_at, processed_at)
       VALUES ($1, $2, $3, 'historical-provider', $4, 'PROCESSED',
               transaction_timestamp(), transaction_timestamp())`,
      [randomUUID(), fixture.organizationId, payment.id, randomUUID()],
    );
    const registry = new TestDigitalProviderRegistry();
    registry.adapters.set("provider-a", new TestDigitalProvider());
    await expectDigitalError(
      context.collect(fixture, randomUUID(), registry),
      "DIGITAL_COLLECTION_STATE_CONFLICT",
    );
    expect((await context.collectionEffects(fixture)).operations).toEqual([]);
  });

  it("fails closed for a non-representable canonical amount", async () => {
    const fixture = await context.fixture("USD");
    await context.adminPool.query(
      `UPDATE payments SET service_amount = 5.001, amount_due = 5.001
       WHERE valet_session_id = $1`,
      [fixture.sessionId],
    );
    const registry = new TestDigitalProviderRegistry();
    registry.adapters.set("provider-a", new TestDigitalProvider());
    await expectDigitalError(
      context.collect(fixture, randomUUID(), registry),
      "DIGITAL_COLLECTION_STATE_CONFLICT",
    );
    expect((await context.collectionEffects(fixture)).operations).toEqual([]);
  });
});
