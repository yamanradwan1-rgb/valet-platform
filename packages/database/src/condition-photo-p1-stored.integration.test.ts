import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConditionPhotoP1TestContext,
} from "./condition-photo-p1-test-context";

let ctx: ConditionPhotoP1TestContext;

beforeAll(async () => {
  ctx = new ConditionPhotoP1TestContext();
  await ctx.start();
}, 210_000);

afterAll(async () => {
  await ctx?.stop();
}, 60_000);

async function storedState(id: string) {
  const result = await ctx.pool.query<{
    status: string; digest: string | null; stored_at: Date | null;
    lease_owner: string | null; byte_size: number | null;
  }>(
    `SELECT status::text,encode(canonical_sha256,'hex') AS digest,
            stored_at,lease_owner,canonical_byte_size AS byte_size
     FROM condition_photo_upload_attempts WHERE id=$1`,
    [id],
  );
  return result.rows[0];
}

describe("Issue #215 P1 durable STORED claim and lost-response fencing", () => {
  it("commits STORED bytes once, tolerates identical repeat, and denies altered digest", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    await ctx.markStored(scope, op);
    const initial = await storedState(op.attempt_id);
    expect(initial).toMatchObject({
      status: "STORED", digest: "b".repeat(64),
      lease_owner: op.lease_owner, byte_size: 256,
    });
    expect(initial?.stored_at).toBeInstanceOf(Date);
    await ctx.markStored(scope, op);
    expect(await storedState(op.attempt_id)).toEqual(initial);
    await expect(ctx.markStored(scope, op, "c".repeat(64))).rejects.toBeDefined();
    expect(await storedState(op.attempt_id)).toEqual(initial);
    expect(await ctx.finalize(scope, op)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects mismatched fencing owner and expired original lease before writing STORED", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    await expect(ctx.markStored(scope, { ...op, lease_owner: randomUUID() }))
      .rejects.toBeDefined();
    expect((await storedState(op.attempt_id))?.status).toBe("WRITING");
    await ctx.pool.query(
      `UPDATE condition_photo_upload_attempts
       SET lease_expires_at=clock_timestamp()-interval '1 second'
       WHERE id=$1`,
      [op.attempt_id],
    );
    await expect(ctx.markStored(scope, op)).rejects.toBeDefined();
    expect((await storedState(op.attempt_id))?.status).toBe("WRITING");
    const lease = await ctx.pool.query<{
      attempt_id: string; lease_owner: string;
    }>(
      `SELECT * FROM condition_photo_claim_upload($1,$2,$3,TRUE,'issue215_test')`,
      [scope.userId, scope.memberId, op.operation_id],
    );
    const resumed = lease.rows[0];
    if (!resumed) throw new Error("No active recovery lease returned.");
    expect(resumed.attempt_id).toBe(op.attempt_id);
    expect(resumed.lease_owner).not.toBe(op.lease_owner);
    await ctx.markStored(scope, { ...op, lease_owner: resumed.lease_owner });
    expect((await storedState(op.attempt_id))?.status).toBe("STORED");
  });

  it("rolls back an uncommitted STORED transition; explicit retry can safely persist and finalize", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    const tx = await ctx.pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query(
        `SELECT public.condition_photo_mark_stored(
           $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,NULL::text,
           decode(repeat('b',64),'hex'),256,10,10)`,
        [scope.userId, scope.memberId, op.operation_id, op.attempt_id, op.lease_owner],
      );
      await tx.query("ROLLBACK");
    } finally {
      await tx.query("ROLLBACK").catch(() => undefined);
      tx.release();
    }
    expect((await storedState(op.attempt_id))?.status).toBe("WRITING");
    await ctx.markStored(scope, op);
    expect((await storedState(op.attempt_id))?.status).toBe("STORED");
    expect(await ctx.finalize(scope, op)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
