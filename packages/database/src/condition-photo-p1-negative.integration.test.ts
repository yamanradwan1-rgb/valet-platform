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

function createAttempt(
  scope: PhotoTestScope,
  record: ReservedPhoto,
  update: {
    readonly locationId?: string;
    readonly sessionId?: string;
    readonly memberId?: string;
    readonly attemptNumber?: number;
    readonly objectKey?: string;
    readonly status?: "ABANDONED" | "WRITING";
  } = {},
) {
  const state = update.status ?? "ABANDONED";
  return ctx.pool.query(
    `INSERT INTO condition_photo_upload_attempts(
       id,operation_id,organization_id,location_id,valet_session_id,
       actor_membership_id,attempt_number,object_key,bucket_alias,status,
       abandoned_at,lease_owner,lease_expires_at,normalization_version)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'issue215_test',$9::condition_photo_attempt_status,
       CASE WHEN $9::condition_photo_attempt_status='ABANDONED' THEN clock_timestamp() ELSE NULL END,
       CASE WHEN $9::condition_photo_attempt_status='WRITING' THEN gen_random_uuid() ELSE NULL END,
       CASE WHEN $9::condition_photo_attempt_status='WRITING'
         THEN clock_timestamp()+interval '1 minute' ELSE NULL END,1)`,
    [
      randomUUID(), record.operation_id, scope.orgId,
      update.locationId ?? scope.locationId,
      update.sessionId ?? scope.sessionId,
      update.memberId ?? scope.memberId,
      update.attemptNumber ?? 2,
      update.objectKey ?? `condition-photo/tombstone/${randomUUID()}`,
      state,
    ],
  );
}

describe("Issue #215 P1 constraint, fencing, and cleanup negatives", () => {
  it("denies attempts bound to other locations, sessions, or memberships by composite FK", async () => {
    const parent = await ctx.seed();
    const other = await ctx.seed();
    const op = await ctx.reserve(parent);
    await expect(createAttempt(parent, op, { locationId: other.locationId }))
      .rejects.toMatchObject({ code: "23503" });
    await expect(createAttempt(parent, op, { sessionId: other.sessionId }))
      .rejects.toMatchObject({ code: "23503" });
    await expect(createAttempt(parent, op, { memberId: other.memberId }))
      .rejects.toMatchObject({ code: "23503" });
    const intact = await ctx.pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM condition_photo_upload_attempts WHERE operation_id=$1",
      [op.operation_id],
    );
    expect(intact.rows[0]?.n).toBe("1");
  });

  it("rejects duplicate attempt number, object key, and simultaneous WRITING attempt", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    await expect(createAttempt(scope, op, { attemptNumber: 1 }))
      .rejects.toMatchObject({ code: "23505" });
    await expect(createAttempt(scope, op, { objectKey: op.object_key }))
      .rejects.toMatchObject({ code: "23505" });
    await expect(createAttempt(scope, op, { status: "WRITING" }))
      .rejects.toMatchObject({ code: "23505" });
  });

  it("rejects malformed source SHA, attempted canonical SHA, and invalid pixel dimensions", async () => {
    const scope = await ctx.seed();
    await expect(ctx.pool.query(
      `INSERT INTO condition_photo_upload_operations(
         id,client_operation_id,organization_id,location_id,
         valet_session_id,actor_membership_id,purpose,source_sha256,
         source_byte_size,normalization_version,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,'CHECK_IN_CONDITION',
         decode(repeat('a',62),'hex'),256,1,clock_timestamp()+interval '30 minutes')`,
      [
        randomUUID(), randomUUID(), scope.orgId, scope.locationId,
        scope.sessionId, scope.memberId,
      ],
    )).rejects.toMatchObject({ code: "23514" });
    const op = await ctx.reserve(scope);
    await expect(ctx.pool.query(
      `UPDATE condition_photo_upload_attempts SET status='STORED',
         stored_at=clock_timestamp(),canonical_sha256=decode(repeat('b',62),'hex'),
         canonical_byte_size=256,width=10,height=10 WHERE id=$1`,
      [op.attempt_id],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(ctx.pool.query(
      `UPDATE condition_photo_upload_attempts SET status='STORED',
         stored_at=clock_timestamp(),canonical_sha256=decode(repeat('b',64),'hex'),
         canonical_byte_size=256,width=0,height=10 WHERE id=$1`,
      [op.attempt_id],
    )).rejects.toMatchObject({ code: "23514" });
    await expect(ctx.pool.query(
      `SELECT public.condition_photo_finalize_upload(
         $1,$2,$3,$4,$5,NULL,
         decode(repeat('b',64),'hex'),256,4096,4096)`,
      [scope.userId, scope.memberId, op.operation_id, op.attempt_id, op.lease_owner],
    )).rejects.toMatchObject({ code: "55000" });
  });

  it("denies matching metadata row with wrong attempt object key as verification", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    const photoId = randomUUID();
    const rogueKey = `metadata-only/rogue/${randomUUID()}`;
    await ctx.pool.query(
      `INSERT INTO vehicle_photos(
         id,organization_id,location_id,valet_session_id,
         captured_by_membership_id,purpose,storage_object_key,content_type)
       VALUES($1,$2,$3,$4,$5,'CHECK_IN_CONDITION',$6,'image/jpeg')`,
      [
        photoId, scope.orgId, scope.locationId,
        scope.sessionId, scope.memberId, rogueKey,
      ],
    );
    await expect(ctx.pool.query(
      `INSERT INTO vehicle_photo_verifications(
         vehicle_photo_id,operation_id,attempt_id,organization_id,location_id,
         valet_session_id,captured_by_membership_id,purpose,object_key,
         byte_size,content_sha256,width,height,normalization_version)
       VALUES($1,$2,$3,$4,$5,$6,$7,'CHECK_IN_CONDITION',
         $8,256,decode(repeat('b',64),'hex'),10,10,1)`,
      [
        photoId, op.operation_id, op.attempt_id, scope.orgId,
        scope.locationId, scope.sessionId, scope.memberId, rogueKey,
      ],
    )).rejects.toMatchObject({ code: "23503" });
    const count = await ctx.pool.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM vehicle_photo_verifications WHERE vehicle_photo_id=$1",
      [photoId],
    );
    expect(count.rows[0]?.n).toBe("0");
  });

  it("fences expired writer even after explicit re-lease of the same pending attempt", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    await ctx.pool.query(
      `UPDATE condition_photo_upload_attempts
       SET lease_expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1`,
      [op.attempt_id],
    );
    await expect(ctx.finalize(scope, op)).rejects.toMatchObject({ code: "55000" });
    const result = await ctx.pool.query<ReservedPhoto>(
      `SELECT * FROM condition_photo_claim_upload($1,$2,$3,TRUE,'issue215_test')`,
      [scope.userId, scope.memberId, op.operation_id],
    );
    const claimed = result.rows[0];
    if (!claimed) throw new Error("Reconciliation claim did not return a lease.");
    expect(claimed?.attempt_id).toBe(op.attempt_id);
    expect(claimed?.lease_owner).not.toBe(op.lease_owner);
    await expect(ctx.finalize(scope, op)).rejects.toMatchObject({ code: "55000" });
    expect(await ctx.finalize(scope, claimed)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("preserves abandoned key tombstones and permits maintenance inspection only after abandon", async () => {
    const scope = await ctx.seed();
    const old = await ctx.reserve(scope);
    await ctx.pool.query(
      `UPDATE condition_photo_upload_attempts
       SET lease_expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1`,
      [old.attempt_id],
    );
    const row = await ctx.pool.query<ReservedPhoto>(
      `SELECT * FROM condition_photo_claim_upload($1,$2,$3,FALSE,'issue215_test')`,
      [scope.userId, scope.memberId, old.operation_id],
    );
    const replacement = row.rows[0];
    if (!replacement) throw new Error("Replacement claim did not return a lease.");
    expect(replacement?.attempt_id).not.toBe(old.attempt_id);
    expect(replacement?.object_key).not.toBe(old.object_key);
    const tombstone = await ctx.pool.query<{
      status: string; object_key: string; abandoned_at: Date;
    }>(
      `SELECT status::text,object_key,abandoned_at
       FROM condition_photo_upload_attempts WHERE id=$1`,
      [old.attempt_id],
    );
    expect(tombstone.rows[0]).toMatchObject({
      status: "ABANDONED", object_key: old.object_key,
    });
    expect(tombstone.rows[0]?.abandoned_at).toBeInstanceOf(Date);
    const inspected = await ctx.pool.query<{ cleaned: boolean }>(
      "SELECT condition_photo_abandon_attempt($1) AS cleaned",
      [old.attempt_id],
    );
    expect(inspected.rows[0]?.cleaned).toBe(true);
    const persisted = await ctx.pool.query<{ checked_at: Date }>(
      `SELECT last_cleanup_checked_at AS checked_at
       FROM condition_photo_upload_attempts WHERE id=$1`,
      [old.attempt_id],
    );
    expect(persisted.rows[0]?.checked_at).toBeInstanceOf(Date);
    expect(await ctx.finalize(scope, replacement)).toMatch(/^[0-9a-f-]{36}$/);
    const selected = await ctx.pool.query<{ cleaned: boolean }>(
      "SELECT condition_photo_abandon_attempt($1) AS cleaned",
      [replacement.attempt_id],
    );
    expect(selected.rows[0]?.cleaned).toBe(false);
  });

  it("a committed reservation remains the single winner after a concurrent lock holder rolls back", async () => {
    const scope = await ctx.seed();
    const clientId = randomUUID();
    const op = await ctx.reserve(scope, clientId);
    const lockHolder = await ctx.pool.connect();
    try {
      await lockHolder.query("BEGIN");
      await lockHolder.query(
        "SELECT id FROM condition_photo_upload_operations WHERE id=$1 FOR UPDATE",
        [op.operation_id],
      );
      const concurrent = ctx.reserve(scope, clientId);
      await new Promise((resolve) => setTimeout(resolve, 70));
      await lockHolder.query("ROLLBACK");
      const result = await concurrent;
      expect(result.operation_id).toBe(op.operation_id);
      expect(result.attempt_id).toBe(op.attempt_id);
    } finally {
      await lockHolder.query("ROLLBACK").catch(() => undefined);
      lockHolder.release();
    }
  });
});
