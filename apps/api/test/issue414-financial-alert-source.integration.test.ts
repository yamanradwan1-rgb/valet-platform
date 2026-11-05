import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProviderEventIngress } from "../src/modules/payments/provider-event-ingress";
import { createDigitalCollectionExecutor } from "../src/modules/payments/digital-collection-command";
import {
  TestDigitalProvider,
  TestDigitalProviderRegistry,
} from "./digital-collection-test-context";
import { TestProviderEventAuthenticator } from "./provider-event-test-context";
import {
  FinancialAlertTestContext,
  type CollectionSeed,
} from "./issue414-financial-alert-fixture";

const db = new FinancialAlertTestContext("outcomes");

let organizationId: string;
beforeAll(async () => {
  await db.setup();
  organizationId = (await db.managerFixture()).organizationId;
}, 120_000);
afterAll(() => db.teardown(), 120_000);

function callback(
  seed: CollectionSeed,
  kind: "COLLECTION_FAILED" | "COLLECTION_SUCCEEDED" | "NO_FINANCIAL_CHANGE",
  options: { operationId?: string; reference?: string; provider?: string } = {},
) {
  return {
    binding: {
      organizationId,
      provider: options.provider ?? "provider-a",
    },
    event: {
      subject: "COLLECTION" as const,
      kind,
      operationId: options.operationId ?? seed.operationId,
      providerEventId: randomUUID(),
      providerReference: options.reference ?? seed.reference,
      safeResultCode: null,
    },
  };
}

const ingest = createProviderEventIngress;
async function deliver(event: ReturnType<typeof callback>) {
  const authenticator = new TestProviderEventAuthenticator();
  return ingest(db.runtimePool, authenticator)(event);
}

describe("DEC-111 ALT-10/11 real callback and current-source lifecycle", () => {
  it("uses the original guard time, strict delay boundaries, and does not age PREPARED", async () => {
    const input = await db.managerReaderInput();
    const seed = await db.seedUnresolved("OUTCOME_UNKNOWN", 119);
    expect(await db.exact(input, seed, "ALT-11")).toBeNull();
    expect(
      await db.exact({ ...input, unknownDelaySeconds: 60 }, seed, "ALT-11"),
    ).toMatchObject({ category: "ALT-11", episodeId: seed.operationId });
    await db.adminPool.query(
      `UPDATE payment_collection_operations SET state='PREPARED',
           dispatch_guarded_at=NULL, updated_at=clock_timestamp()
       WHERE id=$1`,
      [seed.operationId],
    );
    expect(await db.exact(input, seed, "ALT-11")).toBeNull();
  });

  it("keeps REFERENCE_ATTACHED pending without restarting the guard, then retires on late success", async () => {
    const input = await db.managerReaderInput();
    const seed = await db.seedUnresolved("OUTCOME_UNKNOWN", 180);
    const before = await db.exact(input, seed, "ALT-11");
    expect(before).toMatchObject({
      category: "ALT-11",
      episodeId: seed.operationId,
    });
    await db.adminPool.query(
      `UPDATE payment_collection_operations SET state='REFERENCE_ATTACHED',
           provider_reference=$2, updated_at=clock_timestamp()
       WHERE id=$1`,
      [seed.operationId, seed.reference],
    );
    await db.adminPool.query(
      "UPDATE payments SET provider_reference=$2, updated_at=clock_timestamp() WHERE id=$1",
      [seed.paymentId, seed.reference],
    );
    const attached = await db.exact(input, seed, "ALT-11");
    expect(attached?.occurredAt).toBe(before?.occurredAt);
    expect(attached?.episodeId).toBe(before?.episodeId);
    expect(await deliver(callback(seed, "COLLECTION_SUCCEEDED"))).toMatchObject(
      { processingStatus: "PROCESSED" },
    );
    expect(await db.exact(input, seed, "ALT-11")).toBeNull();
    expect(await db.exact(input, seed, "ALT-10")).toBeNull();
  });

  it("tracks different definitive FAILED generations, retires new attempts, and never retries on GET", async () => {
    const input = await db.managerReaderInput();
    const seed = await db.seedUnresolved("OUTCOME_UNKNOWN", 180);
    expect(await deliver(callback(seed, "COLLECTION_FAILED"))).toMatchObject({
      processingStatus: "PROCESSED",
    });
    expect(await db.exact(input, seed, "ALT-11")).toBeNull();
    const failed = await db.exact(input, seed, "ALT-10");
    expect(failed).toMatchObject({
      category: "ALT-10",
      episodeId: seed.operationId,
    });
    const replay = await deliver(callback(seed, "COLLECTION_FAILED"));
    expect(replay.processingStatus).toBe("IGNORED");
    expect(await db.exact(input, seed, "ALT-10")).toEqual(failed);

    const base = await db.managerFixture();
    await db.adminPool.query(
      "UPDATE organizations SET payment_methods_policy='CASH_OR_DIGITAL' WHERE id=$1",
      [base.organizationId],
    );
    const registry = new TestDigitalProviderRegistry();
    registry.adapters.set("provider-a", new TestDigitalProvider());
    const next = await createDigitalCollectionExecutor(
      db.runtimePool,
      registry,
    )({
      valetSessionId: seed.sessionId,
      submissionIdempotencyKey: randomUUID(),
    });
    expect(next.state).toBe("OUTCOME_UNKNOWN");
    expect(next.id).not.toBe(seed.operationId);
    expect(await db.exact(input, seed, "ALT-10")).toBeNull();
    await db.adminPool.query(
      `UPDATE payment_collection_operations
       SET dispatch_guarded_at=clock_timestamp()-interval '180 seconds'
       WHERE id=$1`,
      [next.id],
    );
    expect(await db.exact(input, seed, "ALT-11", next.id)).toMatchObject({
      category: "ALT-11",
      episodeId: next.id,
    });
    const second = await deliver(
      callback(seed, "COLLECTION_FAILED", {
        operationId: next.id,
        reference: `second-${randomUUID()}`,
      }),
    );
    expect(second.processingStatus).toBe("PROCESSED");
    expect(await db.exact(input, seed, "ALT-10", next.id)).toMatchObject({
      episodeId: next.id,
      category: "ALT-10",
    });
    expect(await db.exact(input, seed, "ALT-10", seed.operationId)).toBeNull();
  });

  it("fails closed for a fabricated failed status without an authoritative audit", async () => {
    const input = await db.managerReaderInput();
    const seed = await db.seedUnresolved("OUTCOME_UNKNOWN", 300);
    await db.adminPool.query(
      `UPDATE payment_collection_operations SET state='RESOLVED',
           provider_reference=$2, resolved_at=clock_timestamp(),
           updated_at=clock_timestamp() WHERE id=$1`,
      [seed.operationId, seed.reference],
    );
    await db.adminPool.query(
      `UPDATE payments SET status='FAILED', provider_reference=$2,
           updated_at=clock_timestamp() WHERE id=$1`,
      [seed.paymentId, seed.reference],
    );
    expect(await db.exact(input, seed, "ALT-10")).toBeNull();
    expect(await db.exact(input, seed, "ALT-11")).toBeNull();
  });

  it("suppresses a previous verified FAILED episode during a newly unknown attempt even before the warning delay", async () => {
    const input = await db.managerReaderInput();
    const seed = await db.seedUnresolved("OUTCOME_UNKNOWN", 300);
    expect(
      (await deliver(callback(seed, "COLLECTION_FAILED"))).processingStatus,
    ).toBe("PROCESSED");
    expect(await db.exact(input, seed, "ALT-10")).toMatchObject({
      episodeId: seed.operationId,
    });
    const newOperationId = randomUUID();
    // Contested/legacy source combination: the old FAILED projection remains
    // while an operation is guarded. The new unresolved operation wins.
    await db.adminPool.query(
      `INSERT INTO payment_collection_operations
         (id,organization_id,payment_id,submission_idempotency_key,
          amount,currency,provider,state,dispatch_guarded_at,updated_at)
       VALUES($1,$2,$3,$4,5,'JOD','provider-a','OUTCOME_UNKNOWN',
              clock_timestamp(),clock_timestamp())`,
      [newOperationId, organizationId, seed.paymentId, randomUUID()],
    );
    expect(await db.exact(input, seed, "ALT-10")).toBeNull();
    expect(await db.exact(input, seed, "ALT-11", newOperationId)).toBeNull();
    expect(
      (await db.list(input)).filter((item) => item.sourceId === seed.paymentId),
    ).toHaveLength(0);
    await db.adminPool.query(
      `UPDATE payment_collection_operations
       SET dispatch_guarded_at=clock_timestamp()-interval '180 seconds'
       WHERE id=$1`,
      [newOperationId],
    );
    expect(await db.exact(input, seed, "ALT-11", newOperationId)).toMatchObject(
      { episodeId: newOperationId, category: "ALT-11" },
    );
    expect(await db.exact(input, seed, "ALT-10")).toBeNull();
  });

  it("rejects mismatched provider callback and keeps uncertainty without changing Payment", async () => {
    const input = await db.managerReaderInput();
    const seed = await db.seedUnresolved("REFERENCE_ATTACHED", 180);
    const ignored = await deliver(
      callback(seed, "COLLECTION_FAILED", {
        reference: `wrong-${randomUUID()}`,
      }),
    );
    expect(ignored.processingStatus).toBe("IGNORED");
    expect(await db.exact(input, seed, "ALT-11")).toMatchObject({
      episodeId: seed.operationId,
    });
    expect(await db.exact(input, seed, "ALT-10")).toBeNull();
  });

  it("does not double-emit during a callback/read race and leaves financial state to the provider writer", async () => {
    const input = await db.managerReaderInput();
    const seed = await db.seedUnresolved("OUTCOME_UNKNOWN", 180);
    const before = await db.adminPool.query(
      "SELECT status, amount_paid FROM payments WHERE id=$1",
      [seed.paymentId],
    );
    const [read, event] = await Promise.all([
      db.list(input),
      deliver(callback(seed, "COLLECTION_FAILED")),
    ]);
    expect(event.processingStatus).toBe("PROCESSED");
    expect(
      read.filter((item) => item.sourceId === seed.paymentId),
    ).toHaveLength(1);
    expect(await db.exact(input, seed, "ALT-10")).toMatchObject({
      episodeId: seed.operationId,
    });
    const after = await db.adminPool.query(
      "SELECT status, amount_paid FROM payments WHERE id=$1",
      [seed.paymentId],
    );
    expect(before.rows[0]?.status).toBe("UNPAID");
    expect(after.rows[0]?.status).toBe("FAILED");
    expect(after.rows[0]?.amount_paid).toEqual(before.rows[0]?.amount_paid);
  });

  it("does not invent a failure on rolled-back reconciliation; a later authentic retry resolves once", async () => {
    const input = await db.managerReaderInput();
    const seed = await db.seedUnresolved("OUTCOME_UNKNOWN", 180);
    const event = callback(seed, "COLLECTION_FAILED");
    const broken = createProviderEventIngress(
      db.runtimePool,
      new TestProviderEventAuthenticator(),
      { auditEventIdFactory: () => "not-a-uuid" },
    );
    await expect(broken(event)).rejects.toMatchObject({
      code: "PROVIDER_EVENT_PROCESSING_FAILED",
    });
    // Payment/operation changes and event insertion rolled back with audit.
    expect(await db.exact(input, seed, "ALT-11")).toMatchObject({
      category: "ALT-11",
      episodeId: seed.operationId,
    });
    expect(await db.exact(input, seed, "ALT-10")).toBeNull();
    const before = await db.adminPool.query(
      "SELECT status FROM payments WHERE id=$1",
      [seed.paymentId],
    );
    expect(before.rows[0]?.status).toBe("UNPAID");
    expect(await deliver(event)).toMatchObject({
      processingStatus: "PROCESSED",
    });
    expect(await db.exact(input, seed, "ALT-11")).toBeNull();
    expect(await db.exact(input, seed, "ALT-10")).toMatchObject({
      category: "ALT-10",
      episodeId: seed.operationId,
    });
  });
});
