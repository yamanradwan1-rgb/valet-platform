import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ProviderEventTestContext,
  TestProviderEventAuthenticator,
} from "./provider-event-test-context";

const context = new ProviderEventTestContext("concurrency");

beforeAll(() => context.setup(), 120_000);
afterAll(() => context.teardown(), 60_000);

function ingressFor(normalized: unknown) {
  const authenticator = new TestProviderEventAuthenticator();
  authenticator.handler = async () => normalized;
  return context.ingress(authenticator);
}

describe("VAL-008E provider-event retry and atomicity", () => {
  it("deduplicates committed sequential delivery without repeated audit", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.referencedOperation(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "COLLECTION_SUCCEEDED",
    );
    const ingress = ingressFor(event);

    const first = await ingress({});
    const duplicate = await ingress({});
    const effects = await context.providerEffects(fixture);
    expect(duplicate).toMatchObject({
      duplicate: true,
      eventId: first.eventId,
      processingStatus: "PROCESSED",
    });
    expect(effects.events).toHaveLength(1);
    expect(effects.audits).toHaveLength(1);
  });

  it("has one winner under concurrent duplicate delivery", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.referencedOperation(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "COLLECTION_SUCCEEDED",
    );
    const ingress = ingressFor(event);

    const results = await Promise.all([ingress({}), ingress({})]);
    const effects = await context.providerEffects(fixture);
    expect(new Set(results.map((result) => result.eventId)).size).toBe(1);
    expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
    expect(effects.events).toHaveLength(1);
    expect(effects.audits).toHaveLength(1);
    expect(effects.payment.amount_paid).toBe("5.000");
  });

  it("allows at most one effect when one event ID targets two Payments", async () => {
    const first = await context.fixture();
    const second = await context.addSession(first);
    await context.initialize(second);
    const firstOperation = (await context.referencedOperation(first)).operation;
    const secondOperation = (
      await context.referencedOperation(second, "event-reference-2")
    ).operation;
    const providerEventId = randomUUID();
    const firstIngress = ingressFor(
      context.collectionEvent(
        first,
        firstOperation.id,
        "COLLECTION_SUCCEEDED",
        {
          providerEventId,
        },
      ),
    );
    const secondIngress = ingressFor(
      context.collectionEvent(
        second,
        secondOperation.id,
        "COLLECTION_SUCCEEDED",
        {
          providerEventId,
          providerReference: "event-reference-2",
        },
      ),
    );

    const results = await Promise.all([firstIngress({}), secondIngress({})]);
    const effects = [
      await context.providerEffects(first),
      await context.providerEffects(second),
    ];
    expect(new Set(results.map((result) => result.eventId)).size).toBe(1);
    expect(effects.flatMap((effect) => effect.events)).toHaveLength(1);
    expect(effects.flatMap((effect) => effect.audits)).toHaveLength(1);
    expect(
      effects.filter((effect) => effect.payment.status === "PAID"),
    ).toHaveLength(1);
  });

  it("persists a concurrent provider-reference collision as IGNORED", async () => {
    const first = await context.fixture();
    const second = await context.addSession(first);
    await context.initialize(second);
    const firstOperation = (await context.unresolvedOperation(first)).operation;
    const secondOperation = (await context.unresolvedOperation(second))
      .operation;
    const reference = `collision-${randomUUID()}`;

    const results = await Promise.all([
      ingressFor(
        context.collectionEvent(
          first,
          firstOperation.id,
          "COLLECTION_SUCCEEDED",
          { providerReference: reference },
        ),
      )({}),
      ingressFor(
        context.collectionEvent(
          second,
          secondOperation.id,
          "COLLECTION_SUCCEEDED",
          { providerReference: reference },
        ),
      )({}),
    ]);
    const effects = [
      await context.providerEffects(first),
      await context.providerEffects(second),
    ];
    expect(results.map((result) => result.processingStatus).sort()).toEqual([
      "IGNORED",
      "PROCESSED",
    ]);
    expect(effects.flatMap((effect) => effect.events)).toHaveLength(2);
    expect(effects.flatMap((effect) => effect.audits)).toHaveLength(1);
    expect(
      effects.filter((effect) => effect.payment.status === "PAID"),
    ).toHaveLength(1);
    expect(
      effects.filter(
        (effect) => effect.operations[0]?.state === "OUTCOME_UNKNOWN",
      ),
    ).toHaveLength(1);
  });

  it("rolls event, finance, operation, and audit back then retries once", async () => {
    const fixture = await context.fixture();
    const { operation } = await context.referencedOperation(fixture);
    const event = context.collectionEvent(
      fixture,
      operation.id,
      "COLLECTION_SUCCEEDED",
      { providerEventId: randomUUID() },
    );
    const ingress = ingressFor(event);
    const before = await context.providerEffects(fixture);
    await context.adminPool.query(
      `CREATE FUNCTION reject_provider_event_audit() RETURNS trigger
         LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.event_type = 'PROVIDER_EVENT_COLLECTION_SUCCEEDED' THEN
             RAISE EXCEPTION 'injected audit failure';
           END IF;
           RETURN NEW;
         END $$;
       CREATE TRIGGER reject_provider_event_audit_trigger
         BEFORE INSERT ON audit_events FOR EACH ROW
         EXECUTE FUNCTION reject_provider_event_audit()`,
    );
    try {
      await expect(ingress({})).rejects.toMatchObject({
        code: "PROVIDER_EVENT_PROCESSING_FAILED",
      });
    } finally {
      await context.adminPool.query(
        `DROP TRIGGER reject_provider_event_audit_trigger ON audit_events;
         DROP FUNCTION reject_provider_event_audit()`,
      );
    }
    expect(await context.providerEffects(fixture)).toEqual(before);

    await expect(ingress({})).resolves.toMatchObject({
      duplicate: false,
      processingStatus: "PROCESSED",
    });
    const after = await context.providerEffects(fixture);
    expect(after.events).toHaveLength(1);
    expect(after.audits).toHaveLength(1);
    expect(after.payment.status).toBe("PAID");
    expect(after.operations[0]?.state).toBe("RESOLVED");
  });
});
