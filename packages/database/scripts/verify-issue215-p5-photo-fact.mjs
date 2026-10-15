import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

export async function proveMaintenanceAvailabilityFact(owner, maintenance, ids) {
  const digest = Buffer.alloc(32, 98);
  const reserved = await owner.query(`SELECT * FROM public.condition_photo_reserve_upload(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,decode(repeat('a',64),'hex'),256,1,'p5_owned')`,
    [ids.user,ids.member,ids.session,randomUUID()]);
  assert.equal(reserved.rowCount,1);
  const record = reserved.rows[0];
  const args = [ids.user, ids.member,record.operation_id,record.attempt_id,
    record.lease_owner,"p5_exact_version",digest,256,10,10];
  const stored = await owner.query(`SELECT public.condition_photo_mark_stored(
     $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,
     $7::bytea,$8::integer,$9::integer,$10::integer) AS result`,args);
  assert.equal(stored.rows[0].result,true);
  const photo = await owner.query(`SELECT public.condition_photo_finalize_upload(
     $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,
     $7::bytea,$8::integer,$9::integer,$10::integer) AS id`,args);
  const photoId = photo.rows[0].id;
  assert.ok(photoId);
  const candidates = await maintenance.query(
    "SELECT * FROM public.condition_photo_maintenance_available_candidates(100,NULL::uuid)");
  const candidate = candidates.rows.find((row) => row.photo_id === photoId);
  assert.ok(candidate);
  assert.equal(candidate.availability,"AVAILABLE");
  assert.equal(candidate.object_version,"p5_exact_version");
  assert.equal(candidate.sha256.equals(digest),true);
  const changed = await maintenance.query(`SELECT
    public.condition_photo_maintenance_mark_unavailable($1::uuid,'CONTENT_MISMATCH') AS changed`,
    [photoId]);
  assert.equal(changed.rows[0].changed,true);
  const retry = await maintenance.query(`SELECT
    public.condition_photo_maintenance_mark_unavailable($1::uuid,'CONTENT_MISMATCH') AS changed`,
    [photoId]);
  assert.equal(retry.rows[0].changed,false);
  const retained = await owner.query(`SELECT
    (SELECT count(*)::int FROM public.vehicle_photo_verifications
      WHERE vehicle_photo_id=$1) AS verification_count,
    (SELECT count(*)::int FROM public.audit_events
      WHERE entity_id=$2 AND event_type='CHECK_IN_CONDITION_PHOTO_UNAVAILABLE') AS audit_count,
    (SELECT state::text FROM public.vehicle_photo_availability
      WHERE vehicle_photo_id=$1) AS state`,[photoId,ids.session]);
  assert.deepEqual(retained.rows[0], {
    verification_count: 1, audit_count: 1, state: "UNAVAILABLE",
  });
  const after = await maintenance.query(
    "SELECT * FROM public.condition_photo_maintenance_available_candidates(100,NULL::uuid)");
  assert.equal(after.rows.some((row) => row.photo_id === photoId),false);
}
