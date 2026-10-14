import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConditionPhotoP1TestContext,
  type PhotoTestScope,
} from "./condition-photo-p1-test-context";

let ctx: ConditionPhotoP1TestContext;
let oldScope: PhotoTestScope;
const legacyPhotoId = randomUUID();
const legacyNoteId = randomUUID();
const legacyKey = `legacy-intake/${randomUUID()}`;

beforeAll(async () => {
  ctx = new ConditionPhotoP1TestContext();
  await ctx.start(true);
  oldScope = await ctx.seed();
  await ctx.pool.query(
    `INSERT INTO condition_notes(
       id,organization_id,location_id,valet_session_id,
       context,content,recorded_by_membership_id)
     VALUES($1,$2,$3,$4,'CHECK_IN',$5,$6)`,
    [
      legacyNoteId, oldScope.orgId, oldScope.locationId, oldScope.sessionId,
      "Preserve this old condition note unchanged", oldScope.memberId,
    ],
  );
  await ctx.pool.query(
    `INSERT INTO vehicle_photos(
       id,organization_id,location_id,valet_session_id,
       captured_by_membership_id,purpose,storage_object_key,content_type)
     VALUES($1,$2,$3,$4,$5,'CHECK_IN_CONDITION',$6,'image/jpeg')`,
    [
      legacyPhotoId,
      oldScope.orgId,
      oldScope.locationId,
      oldScope.sessionId,
      oldScope.memberId,
      legacyKey,
    ],
  );
}, 210_000);

afterAll(async () => {
  await ctx?.stop();
}, 60_000);

describe("Issue #215 P1 real forward upgrade preserves unverified metadata evidence", () => {
  it("has exactly the predecessor migration history and no verification structures", async () => {
    const prior = await ctx.pool.query<{ n: number; verification: string | null }>(
      `SELECT
         (SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL) AS n,
         to_regclass('public.vehicle_photo_verifications')::text AS verification`,
    );
    expect(prior.rows[0]?.n).toBe(79);
    expect(prior.rows[0]?.verification).toBeNull();
  });

  it("runs only the additive P1 migration and keeps the old record intact without a verification child", async () => {
    const old = await ctx.pool.query<{
      id: string; organization_id: string; location_id: string;
      valet_session_id: string; captured_by_membership_id: string;
      purpose: string; storage_object_key: string; content_type: string;
    }>(
      `SELECT id,organization_id,location_id,valet_session_id,
              captured_by_membership_id,purpose::text,storage_object_key,content_type
       FROM vehicle_photos WHERE id=$1`,
      [legacyPhotoId],
    );
    expect(old.rows).toHaveLength(1);
    const oldNote = await ctx.pool.query(
      `SELECT organization_id,location_id,valet_session_id,
              context::text,content,recorded_by_membership_id
       FROM condition_notes WHERE id=$1`,
      [legacyNoteId],
    );
    expect(oldNote.rows).toHaveLength(1);
    await ctx.upgrade();
    const after = await ctx.pool.query(
      `SELECT id,organization_id,location_id,valet_session_id,
              captured_by_membership_id,purpose::text,storage_object_key,content_type
       FROM vehicle_photos WHERE id=$1`,
      [legacyPhotoId],
    );
    expect(after.rows).toEqual(old.rows);
    const afterNote = await ctx.pool.query(
      `SELECT organization_id,location_id,valet_session_id,
              context::text,content,recorded_by_membership_id
       FROM condition_notes WHERE id=$1`,
      [legacyNoteId],
    );
    expect(afterNote.rows).toEqual(oldNote.rows);
    expect(old.rows[0]?.storage_object_key).toBe(legacyKey);
    const results = await ctx.pool.query<{
      n: number; latest: string; verifications: string; availability: string;
    }>(
      `SELECT
         (SELECT count(*)::int FROM _prisma_migrations
           WHERE finished_at IS NOT NULL) AS n,
         (SELECT max(migration_name) FROM _prisma_migrations
           WHERE finished_at IS NOT NULL) AS latest,
         (SELECT count(*)::text FROM vehicle_photo_verifications
           WHERE vehicle_photo_id=$1) AS verifications,
         (SELECT count(*)::text FROM vehicle_photo_availability
           WHERE vehicle_photo_id=$1) AS availability`,
      [legacyPhotoId],
    );
    expect(results.rows[0]).toEqual({
      n: 80,
      latest: "20261014008000_issue_215_verified_condition_photo_p1",
      verifications: "0",
      availability: "0",
    });
    await expect(ctx.pool.query(
      `INSERT INTO vehicle_photo_availability(
         vehicle_photo_id,organization_id,location_id,valet_session_id,state)
       VALUES($1,$2,$3,$4,'AVAILABLE')`,
      [legacyPhotoId, oldScope.orgId, oldScope.locationId, oldScope.sessionId],
    )).rejects.toMatchObject({ code: "23503" });
  });
});
