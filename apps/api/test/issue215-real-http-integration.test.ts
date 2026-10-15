import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  openIssue215HttpFixture,
  syntheticJpeg,
  type Issue215HttpFixture,
} from "./issue215-http-fixture";

// This suite intentionally does NOT skip: a protected Issue-215 runner must
// explicitly opt in, attest its task-owned PostgreSQL Docker identity and
// attach worker4's versioned private MinIO. It is not a regular CI fake pass.
describe("Issue #284 real Nest HTTP → restricted PG → versioned S3 → audit", () => {
  let h: Issue215HttpFixture;
  beforeAll(async () => { h = await openIssue215HttpFixture(); }, 240_000);
  afterAll(async () => { await h?.close(); }, 90_000);

  async function audits(sessionId: string) {
    const result = await h.db.admin.query<{ event_type: string; total: string }>(
      `SELECT event_type, count(*)::text AS total FROM audit_events
       WHERE valet_session_id=$1 AND event_type IN (
         'CHECK_IN_CONDITION_PHOTO_VERIFIED',
         'VALET_SESSION_CHECK_IN_CONDITION_COMPLETED',
         'VALET_SESSION_CHECK_IN_COMPLETED')
       GROUP BY event_type`,
      [sessionId],
    );
    return Object.fromEntries(result.rows.map((row) => [row.event_type, Number(row.total)]));
  }

  it("uploads a synthetic real JPEG and completes current REQUIRED photo Check-In exactly once", async () => {
    const { scope, authorization } = await h.seed(true);
    const jpeg = await syntheticJpeg();
    const operationId = randomUUID();
    const upload = await h.upload(scope.sessionId, authorization, operationId, jpeg);
    expect(upload.status).toBe(201);
    expect(upload.body).toMatchObject({
      status: "VERIFIED", operationId, valetSessionId: scope.sessionId,
      contentType: "image/jpeg",
    });
    expect(JSON.stringify(upload.body)).not.toMatch(/object_key|bucket|lease|sha256/i);

    const rows = await h.db.admin.query<{
      operation_id: string; photo_id: string; attempt_id: string;
      object_key: string; object_version: string; bucket_alias: string;
      content_sha256: Buffer; byte_size: number; availability: string;
      attempt_status: string; operation_status: string;
    }>(
      `SELECT o.id::text AS operation_id, v.vehicle_photo_id::text AS photo_id,
              a.id::text AS attempt_id, a.object_key, a.object_version,
              a.bucket_alias, v.content_sha256, v.byte_size,
              av.state::text AS availability, a.status::text AS attempt_status,
              o.status::text AS operation_status
       FROM condition_photo_upload_operations o
       JOIN condition_photo_upload_attempts a ON a.operation_id=o.id
       JOIN vehicle_photo_verifications v ON v.operation_id=o.id AND v.attempt_id=a.id
       JOIN vehicle_photo_availability av ON av.vehicle_photo_id=v.vehicle_photo_id
       WHERE o.valet_session_id=$1 AND o.client_operation_id=$2`,
      [scope.sessionId, operationId],
    );
    expect(rows.rows).toHaveLength(1);
    const evidence = rows.rows[0]!;
    expect(evidence).toMatchObject({
      bucket_alias: "issue215_local", availability: "AVAILABLE",
      attempt_status: "SELECTED", operation_status: "VERIFIED",
      photo_id: upload.body.vehiclePhotoId,
    });
    expect(evidence.object_version).toBeTruthy();
    const s3 = await h.privateStore.readExact({
      key: evidence.object_key, version: evidence.object_version,
    });
    expect(s3.version).toBe(evidence.object_version);
    expect(s3.bytes.length).toBe(evidence.byte_size);
    expect(createHash("sha256").update(s3.bytes).digest()).toEqual(evidence.content_sha256);
    expect((await sharp(s3.bytes).metadata()).exif).toBeUndefined();
    expect(s3.bytes.includes(Buffer.from("issue215-private-exif-canary"))).toBe(false);
    s3.bytes.fill(0);

    const discovery = await h.request("GET", scope.sessionId, authorization, "condition-photo-state");
    expect(discovery.status).toBe(200);
    expect(discovery.body).toMatchObject({
      photoPolicy: { required: true, source: "ORGANIZATION_DEFAULT" },
      qualifyingPhotoPresent: true,
    });
    const condition = await h.request("POST", scope.sessionId, authorization, "condition-completion", {});
    expect(condition.status).toBe(200);
    expect(condition.body.completedAt).toEqual(expect.any(String));
    const replay = await h.request("POST", scope.sessionId, authorization, "condition-completion", {});
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(condition.body);
    const complete = await h.request("POST", scope.sessionId, authorization, "complete", {
      expectedVersion: 1,
    });
    expect(complete.status).toBe(200);
    expect(complete.body).toMatchObject({
      state: "AWAITING_PARKING", version: 2, valetSessionId: scope.sessionId,
    });
    const persisted = await h.db.admin.query<{ state: string; version: number }>(
      "SELECT state::text,version FROM valet_sessions WHERE id=$1", [scope.sessionId],
    );
    expect(persisted.rows[0]).toEqual({ state: "AWAITING_PARKING", version: 2 });
    expect(await audits(scope.sessionId)).toEqual({
      CHECK_IN_CONDITION_PHOTO_VERIFIED: 1,
      VALET_SESSION_CHECK_IN_CONDITION_COMPLETED: 1,
      VALET_SESSION_CHECK_IN_COMPLETED: 1,
    });
  }, 60_000);

  it("preserves optional policy with zero photos under an explicit Location false override", async () => {
    const { scope, authorization } = await h.seed(true, false);
    const marker = await h.request("POST", scope.sessionId, authorization, "condition-completion", {});
    expect(marker.status).toBe(200);
    const complete = await h.request("POST", scope.sessionId, authorization, "complete", {
      expectedVersion: 1,
    });
    expect(complete.body).toMatchObject({ state: "AWAITING_PARKING", version: 2 });
    expect(complete.status).toBe(200);
    expect(await audits(scope.sessionId)).toEqual({
      VALET_SESSION_CHECK_IN_CONDITION_COMPLETED: 1,
      VALET_SESSION_CHECK_IN_COMPLETED: 1,
    });
  });

  it("rejects legacy metadata as qualifying evidence without a marker or qualification audit", async () => {
    const { scope, authorization } = await h.seed(true);
    const legacy = await h.request("POST", scope.sessionId, authorization, "condition-photos", {
      contentType: "image/jpeg", storageObjectKey: `legacy/${randomUUID()}`,
    });
    expect(legacy.status).toBe(201);
    const registered = await h.db.admin.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_events
       WHERE valet_session_id=$1 AND event_type='CHECK_IN_CONDITION_PHOTO_REGISTERED'`,
      [scope.sessionId],
    );
    expect(registered.rows[0]?.count).toBe("1");
    const marker = await h.request("POST", scope.sessionId, authorization, "condition-completion", {});
    expect(marker.status).toBe(422);
    expect(marker.body.code).toBe("CHECK_IN_CONDITION_PHOTO_REQUIRED");
    // The metadata registration audit is historical and permitted; only
    // verification, condition completion and final custody audits must be absent.
    expect(await audits(scope.sessionId)).toEqual({});
    const state = await h.db.admin.query<{
      state: string; version: number; marker: Date | null;
    }>(
      `SELECT state::text, version, check_in_condition_completed_at AS marker
       FROM valet_sessions WHERE id=$1`, [scope.sessionId],
    );
    expect(state.rows[0]).toEqual({ state: "CHECKING_IN", version: 1, marker: null });
  });

  it("historical optional marker replays unchanged after policy becomes required; final stays denied", async () => {
    const { scope, authorization } = await h.seed(false);
    const prior = await h.request("POST", scope.sessionId, authorization, "condition-completion", {});
    expect(prior.status).toBe(200);
    await h.db.admin.query(
      "UPDATE organizations SET check_in_photos_required=TRUE WHERE id=$1",
      [scope.orgId],
    );
    const repeated = await h.request("POST", scope.sessionId, authorization, "condition-completion", {});
    expect(repeated.status).toBe(200);
    expect(repeated.body).toEqual(prior.body);
    const final = await h.request("POST", scope.sessionId, authorization, "complete", {
      expectedVersion: 1,
    });
    expect(final.status).toBe(422);
    expect(final.body.code).toBe("PHOTO_REQUIREMENT_NOT_SATISFIED");
    expect(await audits(scope.sessionId)).toEqual({
      VALET_SESSION_CHECK_IN_CONDITION_COMPLETED: 1,
    });
  });

  it("known UNAVAILABLE selected evidence does not qualify and leaves condition marker absent", async () => {
    const { scope, authorization } = await h.seed(true);
    const upload = await h.upload(scope.sessionId, authorization, randomUUID(), await syntheticJpeg());
    expect(upload.status).toBe(201);
    const functionResult = await h.db.admin.query<{ changed: boolean }>(
      `SELECT condition_photo_set_availability($1::uuid,$2::uuid,$3::uuid,
         'UNAVAILABLE'::condition_photo_availability_state,$4::text) AS changed`,
      [scope.userId, scope.memberId, upload.body.vehiclePhotoId, "PROVIDER_INTEGRITY_LOSS"],
    );
    expect(functionResult.rows[0]?.changed).toBe(true);
    const marker = await h.request("POST", scope.sessionId, authorization, "condition-completion", {});
    expect(marker.status).toBe(422);
    expect(marker.body.code).toBe("CHECK_IN_CONDITION_PHOTO_REQUIRED");
    const state = await h.db.admin.query<{ marker: Date | null }>(
      "SELECT check_in_condition_completed_at AS marker FROM valet_sessions WHERE id=$1",
      [scope.sessionId],
    );
    expect(state.rows[0]?.marker).toBeNull();
    expect(await audits(scope.sessionId)).toEqual({ CHECK_IN_CONDITION_PHOTO_VERIFIED: 1 });
  }, 60_000);

  it("concurrent final HTTP CAS admits one success and one completion audit", async () => {
    const { scope, authorization } = await h.seed(false);
    const marker = await h.request("POST", scope.sessionId, authorization, "condition-completion", {});
    expect(marker.status).toBe(200);
    const [left, right] = await Promise.all([
      h.request("POST", scope.sessionId, authorization, "complete", { expectedVersion: 1 }),
      h.request("POST", scope.sessionId, authorization, "complete", { expectedVersion: 1 }),
    ]);
    expect([left.status, right.status].filter((value) => value === 200)).toHaveLength(1);
    const persisted = await h.db.admin.query<{ version: number; state: string }>(
      "SELECT version,state::text FROM valet_sessions WHERE id=$1", [scope.sessionId],
    );
    expect(persisted.rows[0]).toEqual({ version: 2, state: "AWAITING_PARKING" });
    expect(await audits(scope.sessionId)).toEqual({
      VALET_SESSION_CHECK_IN_CONDITION_COMPLETED: 1,
      VALET_SESSION_CHECK_IN_COMPLETED: 1,
    });
  });
});
