import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createPolicyRecoveryOperations,
  type PhotoTestScope,
  type ReservedPhoto,
} from "./issue215-policy-recovery-operations";

interface PolicyContext {
  readonly dbUrl: string;
  pool: Pool;
  start(): Promise<void>;
  stop(): Promise<void>;
  seed(): Promise<PhotoTestScope>;
  reserve(scope: PhotoTestScope): Promise<ReservedPhoto>;
  finalize(scope: PhotoTestScope, lease: ReservedPhoto): Promise<string>;
}

let fixture: PolicyContext;
let observer: Pool;
const { oldOptionalMarker, requirePhoto, reserveDirect } =
  createPolicyRecoveryOperations(() => fixture.pool);

describe("Issue #292 post-marker required-policy upload recovery", () => {
  beforeAll(async () => {
    const url = pathToFileURL(resolve(__dirname,
      "../../../packages/database/src/condition-photo-p1-test-context.ts"));
    const { ConditionPhotoP1TestContext } = await import(/* @vite-ignore */ url.href);
    fixture = new ConditionPhotoP1TestContext();
    await fixture.start();
    observer = new Pool({ connectionString: fixture.dbUrl, max: 1 });
  }, 180_000);

  afterAll(async () => {
    try { await observer?.end(); }
    finally { await fixture?.stop(); }
  }, 30_000);

  it("keeps an optional marker historical and permits a new verified photo only after REQUIRED flip", async () => {
    const scope = await fixture.seed();
    const marker = await oldOptionalMarker(scope);
    await expect(reserveDirect(fixture.pool, scope)).rejects.toBeDefined();
    await requirePhoto(scope);

    const lease = await fixture.reserve(scope);
    const photoId = await fixture.finalize(scope, lease);
    expect(photoId).toMatch(/^[a-f0-9-]{36}$/);

    const result = await fixture.pool.query<{
      marker: Date;
      marker_actor: string;
      state: string;
      version: number;
      verified: string;
      audits: string;
    }>(
      `SELECT s.check_in_condition_completed_at AS marker,
              s.check_in_condition_completed_by_membership_id::text AS marker_actor,
              s.state::text, s.version,
              (SELECT count(*)::text FROM vehicle_photo_verifications v
               WHERE v.valet_session_id=s.id) AS verified,
              (SELECT count(*)::text FROM audit_events a
               WHERE a.valet_session_id=s.id AND
                 a.event_type='CHECK_IN_CONDITION_PHOTO_VERIFIED') AS audits
       FROM valet_sessions s WHERE id=$1`,
      [scope.sessionId],
    );
    expect(result.rows[0]).toMatchObject({
      marker,
      marker_actor: scope.memberId,
      state: "CHECKING_IN",
      version: 1,
      verified: "1",
      audits: "1",
    });
  });

  it("an explicit Location override FALSE wins over a Company REQUIRED default", async () => {
    const scope = await fixture.seed();
    await oldOptionalMarker(scope);
    await fixture.pool.query(
      "UPDATE organizations SET check_in_photos_required=TRUE WHERE id=$1",
      [scope.orgId],
    );
    await fixture.pool.query(
      "UPDATE locations SET check_in_photos_required_override=FALSE WHERE id=$1",
      [scope.locationId],
    );
    await expect(reserveDirect(fixture.pool, scope)).rejects.toBeDefined();
    await fixture.pool.query(
      "UPDATE locations SET check_in_photos_required_override=NULL WHERE id=$1",
      [scope.locationId],
    );
    expect((await fixture.reserve(scope)).operation_id).toBeDefined();
  });

  it("policy rows remain locked during T1; concurrent switch back to OPTIONAL waits", async () => {
    const scope = await fixture.seed();
    await oldOptionalMarker(scope);
    await requirePhoto(scope);
    const writer = await fixture.pool.connect();
    const toggler = await observer.connect();
    try {
      await writer.query("BEGIN");
      await reserveDirect(writer, scope);
      await toggler.query("BEGIN");
      await toggler.query("SET LOCAL statement_timeout='350ms'");
      await expect(
        toggler.query(
          "UPDATE locations SET check_in_photos_required_override=FALSE WHERE id=$1",
          [scope.locationId],
        ),
      ).rejects.toMatchObject({ code: "57014" });
      await toggler.query("ROLLBACK");
      await writer.query("COMMIT");
      await fixture.pool.query(
        "UPDATE locations SET check_in_photos_required_override=FALSE WHERE id=$1",
        [scope.locationId],
      );
      await expect(reserveDirect(fixture.pool, scope)).rejects.toBeDefined();
    } finally {
      await toggler.query("ROLLBACK").catch(() => undefined);
      await writer.query("ROLLBACK").catch(() => undefined);
      toggler.release();
      writer.release();
    }
  }, 15_000);

  it("policy change commits first: an in-flight post-marker T1 cannot accept stale REQUIRED", async () => {
    const scope = await fixture.seed();
    await oldOptionalMarker(scope);
    await requirePhoto(scope);
    const settingsWriter = await fixture.pool.connect();
    const lateUpload = await observer.connect();
    try {
      await settingsWriter.query("BEGIN");
      await settingsWriter.query(
        "UPDATE locations SET check_in_photos_required_override=FALSE WHERE id=$1",
        [scope.locationId],
      );
      await lateUpload.query("BEGIN");
      await lateUpload.query("SET LOCAL statement_timeout='350ms'");
      await expect(reserveDirect(lateUpload, scope))
        .rejects.toMatchObject({ code: "57014" });
      await lateUpload.query("ROLLBACK");
      await settingsWriter.query("COMMIT");
      await expect(reserveDirect(fixture.pool, scope)).rejects.toBeDefined();
      const attempts = await fixture.pool.query<{ count: string }>(
        "SELECT count(*)::text FROM condition_photo_upload_attempts WHERE valet_session_id=$1",
        [scope.sessionId],
      );
      expect(attempts.rows[0]?.count).toBe("0");
    } finally {
      await lateUpload.query("ROLLBACK").catch(() => undefined);
      await settingsWriter.query("ROLLBACK").catch(() => undefined);
      lateUpload.release();
      settingsWriter.release();
    }
  }, 15_000);

  it.each(["AWAITING_PARKING", "CANCELLED"] as const)(
    "%s terminal or advanced custody state denies post-marker photo mutation",
    async (state) => {
      const scope = await fixture.seed();
      await oldOptionalMarker(scope);
      await requirePhoto(scope);
      await fixture.pool.query("UPDATE valet_sessions SET state=$2 WHERE id=$1",
        [scope.sessionId, state]);
      await expect(reserveDirect(fixture.pool, scope)).rejects.toBeDefined();
    },
  );

  it("denies actor revocation and wrong member on post-marker operation", async () => {
    const scope = await fixture.seed();
    await oldOptionalMarker(scope);
    await requirePhoto(scope);
    const lease = await fixture.reserve(scope);
    await expect(fixture.pool.query(
      `SELECT public.condition_photo_mark_stored(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
         NULL::text, decode(repeat('b',64),'hex'),256,10,10)`,
      [scope.userId, randomUUID(), lease.operation_id, lease.attempt_id, lease.lease_owner],
    )).rejects.toBeDefined();
    await fixture.pool.query(
      "UPDATE organization_memberships SET status='INACTIVE' WHERE id=$1",
      [scope.memberId],
    );
    await expect(fixture.finalize(scope, lease)).rejects.toBeDefined();
    const evidence = await fixture.pool.query<{ count: string }>(
      "SELECT count(*)::text FROM vehicle_photo_verifications WHERE valet_session_id=$1",
      [scope.sessionId],
    );
    expect(evidence.rows[0]?.count).toBe("0");
  });

  it("permits distinct authorized actors but never transfers a fenced operation between them", async () => {
    const scope = await fixture.seed();
    await oldOptionalMarker(scope);
    await requirePhoto(scope);
    const secondUser = randomUUID();
    const secondMember = randomUUID();
    await fixture.pool.query(
      "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'test-only','ACTIVE',clock_timestamp())",
      [secondUser, `${secondUser}@issue215.test.invalid`],
    );
    await fixture.pool.query(
      `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
       VALUES($1,$2,$3,'VALET_SUPERVISOR','ACTIVE',clock_timestamp())`,
      [secondMember, scope.orgId, secondUser],
    );
    await fixture.pool.query(
      `INSERT INTO membership_location_access(organization_id,membership_id,location_id)
       VALUES($1,$2,$3)`,
      [scope.orgId, secondMember, scope.locationId],
    );
    const first = await fixture.reserve(scope);
    const other = await reserveDirect(fixture.pool, {
      ...scope, memberId: secondMember, userId: secondUser,
    });
    expect(first.operation_id).not.toBe(other.operation_id);
    await expect(fixture.pool.query(
      `SELECT public.condition_photo_mark_stored(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,
         NULL::text,decode(repeat('b',64),'hex'),256,10,10)`,
      [scope.userId, scope.memberId, other.operation_id,
        other.attempt_id, other.lease_owner],
    )).rejects.toMatchObject({ code: "42501" });
    expect(await fixture.finalize(scope, first)).toMatch(/^[a-f0-9-]{36}$/);
    const rows = await fixture.pool.query<{ status: string }>(
      "SELECT status::text FROM condition_photo_upload_operations WHERE id=$1",
      [other.operation_id],
    );
    expect(rows.rows[0]?.status).toBe("PENDING");
  });

  it("keeps policy helper private to the definer; an unrelated PostgreSQL role cannot execute it", async () => {
    const scope = await fixture.seed();
    const acl = await fixture.pool.query<{ public_execute: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_proc p,
           LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE p.oid='public.condition_photo_session_open_for_upload(uuid)'::regprocedure
           AND a.grantee=0 AND a.privilege_type='EXECUTE'
       ) AS public_execute`,
    );
    expect(acl.rows[0]?.public_execute).toBe(false);
    const restricted = await fixture.pool.connect();
    try {
      await restricted.query("BEGIN");
      await restricted.query("SET LOCAL ROLE pg_monitor");
      await expect(restricted.query(
        "SELECT public.condition_photo_session_open_for_upload($1::uuid)",
        [scope.sessionId],
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await restricted.query("ROLLBACK").catch(() => undefined);
      restricted.release();
    }
  });

  it("keeps unknown provider failures PENDING; terminal REJECTED is not implicitly invented", async () => {
    const scope = await fixture.seed();
    await oldOptionalMarker(scope);
    await requirePhoto(scope);
    const lease = await fixture.reserve(scope);
    await fixture.pool.query(
      `SELECT public.condition_photo_record_failure(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'STORAGE_OUTCOME_UNKNOWN')`,
      [scope.userId, scope.memberId, lease.operation_id,
        lease.attempt_id, lease.lease_owner],
    );
    const state = await fixture.pool.query<{ status: string; reason: string }>(
      `SELECT status::text, last_failure_code AS reason
       FROM condition_photo_upload_operations WHERE id=$1`,
      [lease.operation_id],
    );
    expect(state.rows[0]).toEqual({
      status: "PENDING",
      reason: "STORAGE_OUTCOME_UNKNOWN",
    });
  });
});
