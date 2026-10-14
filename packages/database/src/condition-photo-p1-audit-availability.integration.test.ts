import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConditionPhotoP1TestContext,
  type PhotoTestScope,
} from "./condition-photo-p1-test-context";

let ctx: ConditionPhotoP1TestContext;

beforeAll(async () => {
  ctx = new ConditionPhotoP1TestContext();
  await ctx.start();
}, 210_000);

afterAll(async () => {
  await ctx?.stop();
}, 60_000);

async function spoofVerificationAudit(
  scope: PhotoTestScope,
  operationId: string,
  options: { omitIdempotency?: boolean; wrongEntity?: boolean } = {},
): Promise<void> {
  const tx = await ctx.pool.connect();
  try {
    await tx.query("BEGIN");
    await tx.query(
      `INSERT INTO audit_events(
         id,organization_id,location_id,valet_session_id,actor_membership_id,
         actor_type,event_type,entity_type,entity_id,metadata_json,
         idempotency_key,occurred_at)
       VALUES($1,$2,$3,$4,$5,'MEMBERSHIP',
         'CHECK_IN_CONDITION_PHOTO_VERIFIED','ValetSession',$6,
         '{"purpose":"CHECK_IN_CONDITION","mediaCategory":"image","verificationVersion":1}'::jsonb,
         $7,clock_timestamp())`,
      [
        randomUUID(), scope.orgId, scope.locationId, scope.sessionId,
        scope.memberId, options.wrongEntity ? randomUUID() : scope.sessionId,
        options.omitIdempotency ? null : `condition-photo:${operationId}`,
      ],
    );
    await tx.query("COMMIT");
  } catch (error) {
    await tx.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    tx.release();
  }
}

describe("Issue #215 P1 reserved audit event and availability authority", () => {
  it("rejects forged verification audit before VERIFIED, with/without idempotency or wrong entity", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    await expect(spoofVerificationAudit(scope, op.operation_id))
      .rejects.toMatchObject({ code: "23514" });
    await expect(spoofVerificationAudit(scope, op.operation_id, { omitIdempotency: true }))
      .rejects.toMatchObject({ code: "23514" });
    await expect(spoofVerificationAudit(scope, op.operation_id, { wrongEntity: true }))
      .rejects.toMatchObject({ code: "23514" });
    const leaked = await ctx.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM audit_events
       WHERE event_type='CHECK_IN_CONDITION_PHOTO_VERIFIED'
         AND valet_session_id=$1`,
      [scope.sessionId],
    );
    expect(leaked.rows[0]?.n).toBe("0");
    const photoId = await ctx.finalize(scope, op);
    expect(photoId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("records coded SYSTEM unavailability after CHECKING_IN and preserves idempotence", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    const photoId = await ctx.finalize(scope, op);
    await ctx.pool.query(
      `UPDATE valet_sessions SET state='AWAITING_PARKING',
         updated_at=clock_timestamp() WHERE id=$1`,
      [scope.sessionId],
    );
    const params = [
      scope.userId, scope.memberId, photoId,
      "UNAVAILABLE", "OBJECT_MISSING",
    ];
    const first = await ctx.pool.query<{ changed: boolean }>(
      `SELECT condition_photo_set_availability(
         $1::uuid,$2::uuid,$3::uuid,$4::condition_photo_availability_state,$5::text) AS changed`,
      params,
    );
    expect(first.rows[0]?.changed).toBe(true);
    const repeat = await ctx.pool.query<{ changed: boolean }>(
      `SELECT condition_photo_set_availability(
         $1::uuid,$2::uuid,$3::uuid,$4::condition_photo_availability_state,$5::text) AS changed`,
      params,
    );
    expect(repeat.rows[0]?.changed).toBe(false);
    const audit = await ctx.pool.query<{
      actor_type: string; event_type: string;
      entity_type: string; entity_id: string; metadata_json: unknown;
    }>(
      `SELECT actor_type::text,event_type,entity_type,entity_id,metadata_json
       FROM audit_events
       WHERE valet_session_id=$1 AND event_type='CHECK_IN_CONDITION_PHOTO_UNAVAILABLE'`,
      [scope.sessionId],
    );
    expect(audit.rows).toEqual([{
      actor_type: "SYSTEM",
      event_type: "CHECK_IN_CONDITION_PHOTO_UNAVAILABLE",
      entity_type: "ValetSession",
      entity_id: scope.sessionId,
      metadata_json: { reason: "OBJECT_MISSING" },
    }]);
  });

  it("denies availability mutation when Location or Organization became inactive", async () => {
    const scope = await ctx.seed();
    const op = await ctx.reserve(scope);
    const photoId = await ctx.finalize(scope, op);
    const setUnavailable = () => ctx.pool.query(
      `SELECT condition_photo_set_availability(
         $1::uuid,$2::uuid,$3::uuid,'UNAVAILABLE','OBJECT_MISSING')`,
      [scope.userId, scope.memberId, photoId],
    );
    await ctx.pool.query("UPDATE locations SET status='INACTIVE' WHERE id=$1", [scope.locationId]);
    await expect(setUnavailable()).rejects.toMatchObject({ code: "42501" });
    await ctx.pool.query("UPDATE locations SET status='ACTIVE' WHERE id=$1", [scope.locationId]);
    await ctx.pool.query("UPDATE organizations SET status='INACTIVE' WHERE id=$1", [scope.orgId]);
    await expect(setUnavailable()).rejects.toMatchObject({ code: "42501" });
    const current = await ctx.pool.query<{ state: string }>(
      "SELECT state::text FROM vehicle_photo_availability WHERE vehicle_photo_id=$1",
      [photoId],
    );
    expect(current.rows[0]?.state).toBe("AVAILABLE");
  });
});
