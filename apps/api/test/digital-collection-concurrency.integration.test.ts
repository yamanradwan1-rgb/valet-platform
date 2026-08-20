import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  deferred,
  DigitalCollectionTestContext,
  TestDigitalProvider,
  TestDigitalProviderRegistry,
} from "./digital-collection-test-context";

const context = new DigitalCollectionTestContext("concurrency");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

describe("VAL-008D dispatch fencing and atomicity", () => {
  it("grants one CAS winner and invokes the provider exactly once", async () => {
    const fixture = await context.fixture();
    const registry = new TestDigitalProviderRegistry();
    const provider = new TestDigitalProvider();
    registry.adapters.set("provider-a", provider);
    const entered = deferred<void>();
    const release = deferred<{
      kind: "OUTCOME_UNKNOWN";
      safeResultCode: null;
    }>();
    provider.handler = async () => {
      entered.resolve();
      return await release.promise;
    };
    const key = randomUUID();
    const first = context.collect(fixture, key, registry);
    await entered.promise;
    const second = await context.collect(fixture, key, registry);
    release.resolve({ kind: "OUTCOME_UNKNOWN", safeResultCode: null });
    const firstResult = await first;
    expect(second.id).toBe(firstResult.id);
    expect(provider.calls).toHaveLength(1);
    expect((await context.collectionEffects(fixture)).operations).toHaveLength(
      1,
    );
  });

  it("rolls PREPARED, Payment projection, and provider call back with audit", async () => {
    const fixture = await context.fixture();
    const registry = new TestDigitalProviderRegistry();
    const provider = new TestDigitalProvider();
    registry.adapters.set("provider-a", provider);
    await context.adminPool.query(
      `CREATE FUNCTION reject_collection_prepared_audit() RETURNS trigger
         LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.event_type = 'PAYMENT_COLLECTION_PREPARED' THEN
             RAISE EXCEPTION 'injected audit failure';
           END IF;
           RETURN NEW;
         END $$;
       CREATE TRIGGER reject_collection_prepared_audit_trigger
         BEFORE INSERT ON audit_events FOR EACH ROW
         EXECUTE FUNCTION reject_collection_prepared_audit()`,
    );
    try {
      await expect(
        context.collect(fixture, randomUUID(), registry),
      ).rejects.toBeInstanceOf(Error);
    } finally {
      await context.adminPool.query(
        `DROP TRIGGER reject_collection_prepared_audit_trigger ON audit_events;
         DROP FUNCTION reject_collection_prepared_audit()`,
      );
    }
    const effects = await context.collectionEffects(fixture);
    expect(effects.operations).toEqual([]);
    expect(effects.audits).toEqual([]);
    expect(effects.payment).toMatchObject({
      collection_method: "CASH",
      provider: null,
    });
    expect(provider.calls).toHaveLength(0);
  });

  it("does not cross tenant operation identity", async () => {
    const first = await context.fixture();
    const second = await context.fixture();
    const firstRegistry = new TestDigitalProviderRegistry();
    const secondRegistry = new TestDigitalProviderRegistry();
    firstRegistry.adapters.set("provider-a", new TestDigitalProvider());
    secondRegistry.adapters.set("provider-a", new TestDigitalProvider());
    const sharedKey = randomUUID();
    const firstResult = await context.collect(first, sharedKey, firstRegistry);
    const secondResult = await context.collect(
      second,
      sharedKey,
      secondRegistry,
    );
    expect(secondResult.id).not.toBe(firstResult.id);
    const operations = await context.adminPool.query(
      `SELECT organization_id::text, submission_idempotency_key
       FROM payment_collection_operations
       WHERE submission_idempotency_key = $1 ORDER BY organization_id`,
      [sharedKey],
    );
    expect(operations.rows).toHaveLength(2);
  });
});
