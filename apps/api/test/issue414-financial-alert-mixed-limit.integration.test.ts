import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FinancialAlertTestContext,
  type CollectionSeed,
} from "./issue414-financial-alert-fixture";

const db = new FinancialAlertTestContext("mixed-same-ms-limit");

beforeAll(async () => {
  await db.setup();
  await db.managerFixture();
}, 120_000);
afterAll(() => db.teardown(), 120_000);

/** Keep UUID tie ordering deliberately opposite to the category priority. */
function operationId(category: "ALT-10" | "ALT-11", index: number): string {
  const suffix = (index + 1).toString(16).padStart(12, "0");
  return category === "ALT-10"
    ? `00000000-0000-4000-8000-${suffix}`
    : `ffffffff-ffff-4fff-bfff-${suffix}`;
}

describe("DEC-111 mixed financial top-21 must preserve global top-20", () => {
  it("prioritizes same-ms ALT-10 before ALT-11 at the SQL LIMIT boundary", async () => {
    const input = await db.managerReaderInput();
    const instant = await db.adminPool.query<{ at: Date }>(
      "SELECT clock_timestamp() - INTERVAL '180 seconds' AS at",
    );
    const fixedAt = instant.rows[0]!.at;
    const failed: CollectionSeed[] = [];
    const unknown: CollectionSeed[] = [];

    for (let index = 0; index < 12; index += 1) {
      const seed = await db.seedUnresolved(
        "OUTCOME_UNKNOWN",
        300,
        operationId("ALT-10", index),
      );
      await db.adminPool.query(
        `UPDATE payment_collection_operations
         SET state='RESOLVED', provider_reference=$2,
             resolved_at=clock_timestamp(), updated_at=clock_timestamp()
         WHERE id=$1`,
        [seed.operationId, seed.reference],
      );
      await db.adminPool.query(
        `UPDATE payments SET status='FAILED', provider_reference=$2,
             updated_at=clock_timestamp() WHERE id=$1`,
        [seed.paymentId, seed.reference],
      );
      await db.adminPool.query(
        `INSERT INTO audit_events
           (id, organization_id, location_id, valet_session_id,
            actor_membership_id, actor_type, event_type, entity_type,
            entity_id, metadata_json, occurred_at)
         VALUES ($1, $2, $3, $4, NULL, 'EXTERNAL_PROVIDER',
                 'PROVIDER_EVENT_COLLECTION_FAILED',
                 'PaymentCollectionOperation', $5, $6::jsonb, $7)`,
        [
          randomUUID(),
          input.scope.organizationId,
          input.scope.locationId,
          seed.sessionId,
          seed.operationId,
          JSON.stringify({
            payment_id: seed.paymentId,
            operation_id: seed.operationId,
            provider: "provider-a",
            result_kind: "COLLECTION_FAILED",
          }),
          fixedAt,
        ],
      );
      failed.push(seed);
    }
    for (let index = 0; index < 11; index += 1) {
      const seed = await db.seedUnresolved(
        "OUTCOME_UNKNOWN",
        300,
        operationId("ALT-11", index),
      );
      await db.adminPool.query(
        `UPDATE payment_collection_operations
         SET dispatch_guarded_at=$2::timestamptz WHERE id=$1`,
        [seed.operationId, fixedAt],
      );
      unknown.push(seed);
    }

    // Both categories have equal authoritative source milliseconds. The
    // opposite UUID ranges guarantee the old operation-only outer ORDER BY
    // would drop two category-priority ALT-10 cases before global pagination.
    const expected = [
      ...failed.map((seed) => ({ category: "ALT-10", seed })),
      ...unknown.map((seed) => ({ category: "ALT-11", seed })),
    ].sort(
      (left, right) =>
        left.category.localeCompare(right.category) ||
        right.seed.operationId.localeCompare(left.seed.operationId),
    );
    expect(expected).toHaveLength(23);
    const selected = await db.list(input);
    expect(selected).toHaveLength(21);
    expect(new Set(selected.map((row) => row.occurredAt)).size).toBe(1);
    const ids = (rows: typeof selected) =>
      rows.map((row) => `${row.category}:${row.sourceId}:${row.episodeId}`);
    const globalIds = expected.map(
      ({ category, seed }) =>
        `${category}:${seed.paymentId}:${seed.operationId}`,
    );
    expect(ids(selected)).toEqual(globalIds.slice(0, 21));
    expect(ids(selected.slice(0, 20))).toEqual(globalIds.slice(0, 20));
    expect(
      selected.slice(0, 12).every((row) => row.category === "ALT-10"),
    ).toBe(true);
    expect(selected.length > 20).toBe(true); // hasMore on the final page.
    expect(await db.exact(input, unknown[0]!, "ALT-11")).toMatchObject({
      category: "ALT-11",
      episodeId: unknown[0]!.operationId,
    });
  });
});
