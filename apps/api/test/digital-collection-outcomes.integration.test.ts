import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DigitalCollectionTestContext,
  TestDigitalProvider,
  TestDigitalProviderRegistry,
} from "./digital-collection-test-context";

const context = new DigitalCollectionTestContext("outcomes");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function configured() {
  const registry = new TestDigitalProviderRegistry();
  const provider = new TestDigitalProvider();
  registry.adapters.set("provider-a", provider);
  return { provider, registry };
}

describe("VAL-008D normalized initiation outcomes", () => {
  it("keeps adapter throws ambiguous and never redispatches", async () => {
    const fixture = await context.fixture();
    const { provider, registry } = configured();
    provider.handler = async () => {
      throw new Error("raw provider secret-bearing error");
    };
    const key = randomUUID();
    const first = await context.collect(fixture, key, registry);
    const retry = await context.collect(fixture, key, registry);
    expect(first.state).toBe("OUTCOME_UNKNOWN");
    expect(retry).toEqual(first);
    expect(provider.calls).toHaveLength(1);
  });

  it("keeps normalized unknown unresolved and never redispatches", async () => {
    const fixture = await context.fixture();
    const { provider, registry } = configured();
    provider.handler = async () => ({
      kind: "OUTCOME_UNKNOWN",
      safeResultCode: "REMOTE_UNKNOWN",
    });
    const key = randomUUID();
    const first = await context.collect(fixture, key, registry);
    const retry = await context.collect(fixture, key, registry);
    expect(first).toMatchObject({ resolvedAt: null, state: "OUTCOME_UNKNOWN" });
    expect(retry).toEqual(first);
    expect(provider.calls).toHaveLength(1);
  });

  it.each([
    {
      kind: "SUCCEEDED",
      safeResultCode: "ACCEPTED",
    },
    {
      kind: "REFERENCE_ATTACHED",
      providerReference: "x".repeat(401),
      safeResultCode: "ACCEPTED",
    },
    {
      kind: "REJECTED",
      safeResultCode: "raw secret-bearing SDK message",
    },
  ])("keeps malformed normalized result %# ambiguous", async (malformed) => {
    const fixture = await context.fixture();
    const { provider, registry } = configured();
    provider.handler = async () => malformed as never;
    const key = randomUUID();
    const first = await context.collect(fixture, key, registry);
    const retry = await context.collect(fixture, key, registry);
    expect(first).toMatchObject({
      providerReference: null,
      safeResultCode: null,
      state: "OUTCOME_UNKNOWN",
    });
    expect(retry).toEqual(first);
    expect(provider.calls).toHaveLength(1);
  });

  it("attaches a reference without marking Payment paid", async () => {
    const fixture = await context.fixture();
    const { provider, registry } = configured();
    provider.handler = async () => ({
      kind: "REFERENCE_ATTACHED",
      providerReference: "reference-b",
      safeResultCode: "ACCEPTED",
    });
    const key = randomUUID();
    const first = await context.collect(fixture, key, registry);
    const retry = await context.collect(fixture, key, registry);
    expect(first).toMatchObject({
      providerReference: "reference-b",
      resolvedAt: null,
      state: "REFERENCE_ATTACHED",
    });
    expect(retry).toEqual(first);
    expect(provider.calls).toHaveLength(1);
    expect((await context.collectionEffects(fixture)).payment).toMatchObject({
      amount_paid: "0.000",
      paid_at: null,
      status: "UNPAID",
    });
  });

  it("records definitive rejection and permits a new logical attempt", async () => {
    const fixture = await context.fixture();
    const { provider, registry } = configured();
    provider.handler = async () => ({
      kind: "REJECTED",
      safeResultCode: "DECLINED",
    });
    const firstKey = randomUUID();
    const rejected = await context.collect(fixture, firstKey, registry);
    const retry = await context.collect(fixture, firstKey, registry);
    expect(rejected).toMatchObject({
      providerReference: null,
      safeResultCode: "DECLINED",
      state: "REJECTED",
    });
    expect(retry).toEqual(rejected);
    provider.handler = async () => ({
      kind: "OUTCOME_UNKNOWN",
      safeResultCode: null,
    });
    const next = await context.collect(fixture, randomUUID(), registry);
    expect(next.id).not.toBe(rejected.id);
    expect(provider.calls).toHaveLength(2);
    expect((await context.collectionEffects(fixture)).operations).toHaveLength(
      2,
    );
  });

  it("keeps historical PREPARED provider when its adapter is unavailable", async () => {
    const fixture = await context.fixture();
    const existing = await context.insertPrepared(fixture, "provider-old");
    const registry = new TestDigitalProviderRegistry();
    registry.configuredProvider = "provider-new";
    registry.adapters.set("provider-new", new TestDigitalProvider());
    const result = await context.collect(
      fixture,
      existing.submissionIdempotencyKey,
      registry,
    );
    expect(result).toMatchObject({
      dispatchGuardedAt: null,
      provider: "provider-old",
      state: "PREPARED",
    });
    expect(registry.adapters.get("provider-new")).toMatchObject({ calls: [] });
  });

  it("dispatches PREPARED through persisted provider after config changes", async () => {
    const fixture = await context.fixture();
    const existing = await context.insertPrepared(fixture, "provider-old");
    const registry = new TestDigitalProviderRegistry();
    const oldProvider = new TestDigitalProvider();
    const newProvider = new TestDigitalProvider();
    registry.configuredProvider = "provider-new";
    registry.adapters.set("provider-old", oldProvider);
    registry.adapters.set("provider-new", newProvider);
    const result = await context.collect(
      fixture,
      existing.submissionIdempotencyKey,
      registry,
    );
    expect(result).toMatchObject({
      provider: "provider-old",
      state: "OUTCOME_UNKNOWN",
    });
    expect(oldProvider.calls).toHaveLength(1);
    expect(newProvider.calls).toHaveLength(0);
  });

  it.each(["PREPARED", "REJECTED", "RESOLVED"] as const)(
    "keeps financial terms frozen by %s history",
    async (state) => {
      const fixture = await context.fixture();
      const actor = await context.actor(fixture);
      const inserted = await context.insertPrepared(fixture);
      if (state !== "PREPARED")
        await context.terminalize(inserted.operationId, state);
      await expect(
        context.serviceCorrection(fixture, actor),
      ).rejects.toMatchObject({ code: "COLLECTION_ALREADY_STARTED" });
    },
  );
});
