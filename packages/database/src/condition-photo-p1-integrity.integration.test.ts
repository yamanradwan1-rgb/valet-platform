import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConditionPhotoP1TestContext,
  type PhotoTestScope,
  type ReservedPhoto,
} from "./condition-photo-p1-test-context";

let ctx: ConditionPhotoP1TestContext;

beforeAll(async () => {
  ctx = new ConditionPhotoP1TestContext();
  await ctx.start();
}, 210_000);

afterAll(async () => {
  await ctx?.stop();
}, 60_000);

async function count(table: string, column: string, value: string): Promise<number> {
  if (!new Set([
    "condition_photo_upload_operations",
    "condition_photo_upload_attempts",
    "vehicle_photo_verifications",
    "vehicle_photo_availability",
    "vehicle_photos",
  ]).has(table)) throw new Error("Unrecognized fixture table.");
  if (!new Set(["id", "operation_id", "vehicle_photo_id"]).has(column))
    throw new Error("Unrecognized fixture column.");
  const result = await ctx.pool.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM ${table} WHERE ${column}=$1::uuid`,
    [value],
  );
  return Number(result.rows[0]?.total ?? 0);
}

async function insertAbandonedAttempt(
  record: ReservedPhoto,
  scope: PhotoTestScope,
  locationId: string,
): Promise<unknown> {
  return ctx.pool.query(
    `INSERT INTO condition_photo_upload_attempts(
       id,operation_id,organization_id,location_id,valet_session_id,
       actor_membership_id,attempt_number,object_key,bucket_alias,
       status,abandoned_at,normalization_version)
     VALUES($1,$2,$3,$4,$5,$6,2,$7,'issue215_test',
       'ABANDONED',clock_timestamp(),1)`,
    [
      randomUUID(), record.operation_id, scope.orgId, locationId,
      scope.sessionId, scope.memberId, `condition-photo/fixture/${randomUUID()}`,
    ],
  );
}

describe("Issue #215 P1 verified byte evidence integrity", () => {
  it("rejects foreign authorization before mutation and composite wrong-location attempts", async () => {
    const a = await ctx.seed();
    const b = await ctx.seed();
    await expect(
      ctx.reserve({ ...a, userId: b.userId, memberId: b.memberId }),
    ).rejects.toMatchObject({ code: "42501" });
    const aOp = await ctx.reserve(a);
    await expect(insertAbandonedAttempt(aOp, a, b.locationId))
      .rejects.toMatchObject({ code: "23503" });
    expect(await count("condition_photo_upload_operations", "id", aOp.operation_id))
      .toBe(1);
    expect(await count("condition_photo_upload_attempts", "operation_id", aOp.operation_id))
      .toBe(1);
  });

  it("rejects dangling VERIFIED operation on a deferred COMMIT and rolls back all mutation", async () => {
    const scope = await ctx.seed();
    const operation = await ctx.reserve(scope);
    const tx = await ctx.pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query(
        `UPDATE condition_photo_upload_operations
         SET status='VERIFIED',verified_photo_id=$2,updated_at=clock_timestamp()
         WHERE id=$1`,
        [operation.operation_id, randomUUID()],
      );
      await expect(tx.query("COMMIT"))
        .rejects.toMatchObject({ code: "23503" });
    } finally {
      await tx.query("ROLLBACK").catch(() => undefined);
      tx.release();
    }
    const row = await ctx.pool.query<{ status: string; verified_photo_id: string | null }>(
      "SELECT status::text,verified_photo_id::text FROM condition_photo_upload_operations WHERE id=$1",
      [operation.operation_id],
    );
    expect(row.rows[0]).toEqual({ status: "PENDING", verified_photo_id: null });
  });

  it("finalizes one coherent photo with exactly one scoped ValetSession audit and idempotent replay", async () => {
    const scope = await ctx.seed();
    const operation = await ctx.reserve(scope);
    const photoId = await ctx.finalize(scope, operation);
    expect(photoId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await ctx.finalize(scope, operation)).toBe(photoId);
    expect(await count("vehicle_photo_verifications", "operation_id", operation.operation_id))
      .toBe(1);
    expect(await count("vehicle_photo_availability", "vehicle_photo_id", photoId))
      .toBe(1);
    const audit = await ctx.pool.query<{
      event_type: string; entity_type: string; entity_id: string; metadata_json: unknown;
    }>(
      `SELECT event_type,entity_type,entity_id,metadata_json
       FROM audit_events WHERE idempotency_key=$1`,
      [`condition-photo:${operation.operation_id}`],
    );
    expect(audit.rows).toEqual([{
      event_type: "CHECK_IN_CONDITION_PHOTO_VERIFIED",
      entity_type: "ValetSession",
      entity_id: scope.sessionId,
      metadata_json: {
        purpose: "CHECK_IN_CONDITION",
        mediaCategory: "image",
        verificationVersion: 1,
      },
    }]);
    const bound = await ctx.pool.query<{ selected: string; digest_matches: boolean }>(
      `SELECT a.status::text AS selected,
         (a.canonical_sha256=v.content_sha256 AND
          a.canonical_byte_size=v.byte_size) AS digest_matches
       FROM vehicle_photo_verifications v
       JOIN condition_photo_upload_attempts a ON a.id=v.attempt_id
       JOIN condition_photo_upload_operations o ON o.id=v.operation_id
       WHERE o.id=$1 AND o.verified_photo_id=v.vehicle_photo_id`,
      [operation.operation_id],
    );
    expect(bound.rows).toEqual([{ selected: "SELECTED", digest_matches: true }]);
  });

  it("rejects a second SELECTED attempt for an already verified operation", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    await ctx.finalize(scope, op);
    await expect(ctx.pool.query(
      `INSERT INTO condition_photo_upload_attempts(
         id,operation_id,organization_id,location_id,valet_session_id,
         actor_membership_id,attempt_number,object_key,bucket_alias,status,
         canonical_sha256,canonical_byte_size,width,height,stored_at,selected_at,
         normalization_version)
       VALUES($1,$2,$3,$4,$5,$6,2,$7,'issue215_test','SELECTED',
         decode(repeat('b',64),'hex'),256,10,10,
         clock_timestamp(),clock_timestamp(),1)`,
      [
        randomUUID(), op.operation_id, scope.orgId, scope.locationId,
        scope.sessionId, scope.memberId, `condition-photo/extra/${randomUUID()}`,
      ],
    )).rejects.toMatchObject({ code: "23505" });
    const actual = await ctx.pool.query<{ selected: string }>(
      `SELECT count(*)::text AS selected FROM condition_photo_upload_attempts
       WHERE operation_id=$1 AND status='SELECTED'`,
      [op.operation_id],
    );
    expect(actual.rows[0]?.selected).toBe("1");
  });

  it("serializes duplicate UUID reservations to the same operation and one attempt", async () => {
    const scope = await ctx.seed();
    const stableClientId = randomUUID();
    const results = await Promise.all([
      ctx.reserve(scope, stableClientId),
      ctx.reserve(scope, stableClientId),
    ]);
    expect(results[0].operation_id).toBe(results[1].operation_id);
    expect(results[0].attempt_id).toBe(results[1].attempt_id);
    expect(await count("condition_photo_upload_attempts", "operation_id", results[0].operation_id))
      .toBe(1);
  });

  it("enforces two live attempts per persisted User across three organizations concurrently", async () => {
    const first = await ctx.seed();
    const second = await ctx.seed(first.userId);
    const third = await ctx.seed(first.userId);
    const outcomes = await Promise.allSettled([
      ctx.reserve(first),
      ctx.reserve(second),
      ctx.reserve(third),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(2);
    const failures = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toMatchObject({ code: "53300" });
  });
});
