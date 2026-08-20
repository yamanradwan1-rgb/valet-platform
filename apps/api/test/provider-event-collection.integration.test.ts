import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ProviderEventTestContext,
  TestProviderEventAuthenticator,
} from "./provider-event-test-context";

const context = new ProviderEventTestContext("collection");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function ingressFor(normalized: unknown) {
  const authenticator = new TestProviderEventAuthenticator();
  authenticator.handler = async () => normalized;
  return context.ingress(authenticator);
}

describe("VAL-008E collection reconciliation", () => {
  it("resolves REFERENCE_ATTACHED success using canonical money", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.referencedOperation(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "COLLECTION_SUCCEEDED",
    );

    await expect(ingressFor(event)({})).resolves.toMatchObject({
      persisted: true,
      processingStatus: "PROCESSED",
    });
    const effects = await context.providerEffects(fixture);
    expect(effects.events).toHaveLength(1);
    expect(effects.operations[0]).toMatchObject({
      provider_reference: "event-reference",
      state: "RESOLVED",
    });
    expect(effects.payment).toMatchObject({
      amount_due: "5.000",
      amount_paid: "5.000",
      paid_at: expect.any(Date),
      status: "PAID",
    });
    expect(effects.audits).toHaveLength(1);
    expect(effects.audits[0]?.metadata_json).not.toHaveProperty(
      "provider_event_id",
    );
  });

  it("attaches a stable reference while resolving OUTCOME_UNKNOWN", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.unresolvedOperation(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "COLLECTION_SUCCEEDED",
      { providerReference: "attached-during-reconciliation" },
    );

    await ingressFor(event)({});
    const effects = await context.providerEffects(fixture);
    expect(effects.operations[0]).toMatchObject({
      provider_reference: "attached-during-reconciliation",
      state: "RESOLVED",
    });
    expect(effects.payment).toMatchObject({
      provider_reference: "attached-during-reconciliation",
      status: "PAID",
    });
  });

  it.each([
    ["wrong provider", { provider: "provider-b" }],
    ["wrong reference", { providerReference: "wrong-reference" }],
  ])("records %s as IGNORED without financial mutation", async (_, change) => {
    const fixture = await context.fixture();
    const { operation } = await context.referencedOperation(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "COLLECTION_SUCCEEDED",
      !("providerReference" in change)
        ? {}
        : { providerReference: change.providerReference },
    );
    if ("provider" in change) {
      event.binding = { ...event.binding, provider: change.provider } as never;
    }
    const before = await context.providerEffects(fixture);

    const result = await ingressFor(event)({});
    const after = await context.providerEffects(fixture);
    expect(result.processingStatus).toBe("IGNORED");
    expect(after.payment).toEqual(before.payment);
    expect(after.operations).toEqual(before.operations);
    expect(after.audits).toEqual(before.audits);
    expect(after.events).toHaveLength(1);
  });

  it("ignores PREPARED because provider dispatch was never claimed", async () => {
    const fixture = await context.fixture();
    const { operationId } = await context.insertPrepared(fixture);
    const event = context.collectionEvent(
      fixture,
      operationId,
      "COLLECTION_SUCCEEDED",
    );

    const result = await ingressFor(event)({});
    const effects = await context.providerEffects(fixture);
    expect(result.processingStatus).toBe("IGNORED");
    expect(effects.operations[0]?.state).toBe("PREPARED");
    expect(effects.payment.status).toBe("UNPAID");
    expect(effects.audits).toEqual([]);
  });

  it("cannot revive a REJECTED operation", async () => {
    const fixture = await context.fixture();
    const { operationId } = await context.insertPrepared(fixture);
    await context.terminalize(operationId, "REJECTED");
    const event = context.collectionEvent(
      fixture,
      operationId,
      "COLLECTION_SUCCEEDED",
    );

    const result = await ingressFor(event)({});
    const effects = await context.providerEffects(fixture);
    expect(result.processingStatus).toBe("IGNORED");
    expect(effects.operations[0]?.state).toBe("REJECTED");
    expect(effects.payment.status).toBe("UNPAID");
  });

  it("cannot let an old terminal operation rewrite a newer operation", async () => {
    const fixture = await context.fixture();
    const { operationId } = await context.insertPrepared(fixture);
    await context.terminalize(operationId, "REJECTED");
    const { operation: current } = await context.unresolvedOperation(fixture);
    const before = await context.providerEffects(fixture);

    const result = await ingressFor(
      context.collectionEvent(fixture, operationId, "COLLECTION_SUCCEEDED"),
    )({});
    const after = await context.providerEffects(fixture);
    expect(result.processingStatus).toBe("IGNORED");
    expect(after.operations).toEqual(before.operations);
    expect(after.payment).toEqual(before.payment);
    expect(after.operations.at(-1)).toMatchObject({
      id: current.id,
      state: "OUTCOME_UNKNOWN",
    });
  });

  it("cannot downgrade PAID through a reordered failure", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.referencedOperation(fixture);
    await ingressFor(
      context.collectionEvent(fixture, operation.id, "COLLECTION_SUCCEEDED"),
    )({});
    const paid = await context.providerEffects(fixture);

    const result = await ingressFor(
      context.collectionEvent(fixture, operation.id, "COLLECTION_FAILED", {
        providerEventId: randomUUID(),
      }),
    )({});
    const after = await context.providerEffects(fixture);
    expect(result.processingStatus).toBe("IGNORED");
    expect(after.payment).toEqual(paid.payment);
    expect(after.operations).toEqual(paid.operations);
    expect(after.audits).toEqual(paid.audits);
  });

  it("persists NO_FINANCIAL_CHANGE as IGNORED without other effects", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.unresolvedOperation(fixture);
    const before = await context.providerEffects(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "NO_FINANCIAL_CHANGE",
      { providerReference: null },
    );

    const result = await ingressFor(event)({});
    const after = await context.providerEffects(fixture);
    expect(result.processingStatus).toBe("IGNORED");
    expect(after.payment).toEqual(before.payment);
    expect(after.operations).toEqual(before.operations);
    expect(after.audits).toEqual(before.audits);
  });

  it("keeps unresolved-operation precedence after an ignored event", async () => {
    const fixture = await context.fixture();
    const { operation, provider, registry } =
      await context.unresolvedOperation(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "NO_FINANCIAL_CHANGE",
      { providerReference: null },
    );

    await ingressFor(event)({});
    const before = await context.providerEffects(fixture);
    await expect(
      context.collect(fixture, randomUUID(), registry),
    ).rejects.toMatchObject({
      code: "DIGITAL_COLLECTION_OPERATION_IN_PROGRESS",
    });
    expect(provider.calls).toHaveLength(1);
    expect(await context.providerEffects(fixture)).toEqual(before);
  });

  it("projects definitive failure and permits a fresh guarded attempt", async () => {
    const fixture = await context.fixture();
    const { operation, registry } = await context.unresolvedOperation(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "COLLECTION_FAILED",
    );

    await ingressFor(event)({});
    const failed = await context.providerEffects(fixture);
    expect(failed.payment).toMatchObject({
      amount_paid: "0.000",
      paid_at: null,
      status: "FAILED",
    });
    expect(failed.operations[0]?.state).toBe("RESOLVED");

    const next = await context.collect(fixture, randomUUID(), registry);
    expect(next.id).not.toBe(operation.id);
    expect((await context.providerEffects(fixture)).payment).toMatchObject({
      amount_paid: "0.000",
      paid_at: null,
      status: "UNPAID",
    });
  });

  it("does not persist or disclose a foreign-tenant operation correlation", async () => {
    const owner = await context.fixture();
    const attacker = await context.fixture();
    const { operation } = await context.unresolvedOperation(owner);
    const event = context.collectionEvent(
      attacker,
      operation.id,
      "COLLECTION_SUCCEEDED",
    );
    const ownerBefore = await context.providerEffects(owner);
    const attackerBefore = await context.providerEffects(attacker);

    const result = await ingressFor(event)({});
    expect(result).toEqual({
      duplicate: false,
      eventId: null,
      persisted: false,
      processingStatus: "IGNORED",
    });
    expect(await context.providerEffects(owner)).toEqual(ownerBefore);
    expect(await context.providerEffects(attacker)).toEqual(attackerBefore);
  });
});
