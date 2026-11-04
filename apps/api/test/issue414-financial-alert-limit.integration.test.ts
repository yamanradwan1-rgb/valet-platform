import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FinancialAlertTestContext } from "./issue414-financial-alert-fixture";

const db = new FinancialAlertTestContext("same-ms-limit");

beforeAll(async () => {
  await db.setup();
  await db.managerFixture();
}, 120_000);
afterAll(() => db.teardown(), 120_000);

describe("DEC-111 same-millisecond financial source pagination", () => {
  it("uses the deterministic database operation tie-break before top-21 truncation and exact lookup remains independent", async () => {
    const input = await db.managerReaderInput();
    const seeded = [];
    for (let index = 0; index < 23; index += 1) {
      seeded.push(await db.seedUnresolved("OUTCOME_UNKNOWN", 300));
    }
    const operationIds = seeded.map((row) => row.operationId);
    const fixed = await db.adminPool.query<{ instant: Date }>(
      "SELECT clock_timestamp()-interval '300 seconds' AS instant",
    );
    await db.adminPool.query(
      `UPDATE payment_collection_operations
       SET dispatch_guarded_at=$2::timestamptz
       WHERE id = ANY($1::uuid[])`,
      [operationIds, fixed.rows[0]!.instant],
    );
    const selected = await db.list(input);
    expect(selected).toHaveLength(21);
    expect(selected.every((item) => item.category === "ALT-11")).toBe(true);
    expect(new Set(selected.map((item) => item.sourceId)).size).toBe(21);
    expect(new Set(selected.map((item) => item.occurredAt)).size).toBe(1);
    const expected = await db.adminPool.query<{ id: string }>(
      `SELECT id::text
       FROM payment_collection_operations
       WHERE id = ANY($1::uuid[])
       ORDER BY dispatch_guarded_at DESC, id::text DESC
       LIMIT 21`,
      [operationIds],
    );
    expect(selected.map((item) => item.episodeId)).toEqual(
      expected.rows.map((row) => row.id),
    );
    const omitted = seeded.find(
      (row) => !selected.some((item) => item.episodeId === row.operationId),
    );
    expect(omitted).toBeDefined();
    expect(await db.exact(input, omitted!, "ALT-11")).toMatchObject({
      category: "ALT-11",
      sourceId: omitted!.paymentId,
      episodeId: omitted!.operationId,
    });
  });
});
