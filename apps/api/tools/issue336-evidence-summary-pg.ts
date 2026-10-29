import assert from "node:assert/strict";
import { Pool } from "pg";
import { readConditionPhotoEvidenceSummary } from
  "../src/modules/vehicle-photos/condition-photo-evidence-summary-query";

/** Explicitly run only against a dedicated, ephemeral local Issue #336 database. */
const url = process.env.ISSUE336_PG_URL;
if (process.env.ISSUE336_PG_ACK !== "ISOLATED_LOCAL_ONLY" || !url) {
  throw new Error("Issue #336 PostgreSQL check requires explicit isolated local URL.");
}
const target = new URL(url);
if (target.hostname !== "127.0.0.1" || target.pathname !== "/vaylet336") {
  throw new Error("Refusing a PostgreSQL target outside the isolated local test database.");
}

const fixed = (digit: number, prefix: string) =>
  `${prefix}-1111-4111-8111-${String(digit).padStart(12, "0")}`;
const orgA = fixed(1, "aaaaaaaa");
const orgB = fixed(2, "aaaaaaaa");
const locA = fixed(1, "bbbbbbbb");
const locB = fixed(2, "bbbbbbbb");
const sessionA = fixed(1, "cccccccc");
const sessionB = fixed(2, "cccccccc");
const actorA = fixed(1, "dddddddd");
const actorB = fixed(2, "dddddddd");
const scope = {
  organizationId: orgA, locationId: locA,
  valetSessionId: sessionA, actorMembershipId: actorA,
};
async function main() {
const pool = new Pool({ connectionString: url, max: 1 });
const db = await pool.connect();

async function add(index: number, actor = actorA, session = sessionA,
  org = orgA, location = locA, at?: string) {
  const opId = fixed(index, "eeeeeeee");
  const clientOp = fixed(index, "ffffffff");
  const photo = fixed(index, "99999999");
  const timestamp = at ?? `2026-10-29T00:00:${String(index).padStart(2, "0")}.000000Z`;
  await db.query(
    `INSERT INTO condition_photo_upload_operations
     (id,client_operation_id,verified_photo_id,organization_id,location_id,
      valet_session_id,actor_membership_id,status,purpose)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'VERIFIED','CHECK_IN_CONDITION')`,
    [opId, clientOp, photo, org, location, session, actor]);
  await db.query(
    `INSERT INTO vehicle_photo_verifications
     (operation_id,vehicle_photo_id,organization_id,location_id,valet_session_id,
      captured_by_membership_id,purpose,verified_at)
     VALUES ($1,$2,$3,$4,$5,$6,'CHECK_IN_CONDITION',$7)`,
    [opId, photo, org, location, session, actor, timestamp]);
}

try {
  await db.query("BEGIN");
  await db.query(`CREATE TEMP TABLE condition_photo_upload_operations (
    id uuid, client_operation_id uuid, verified_photo_id uuid,
    organization_id uuid, location_id uuid, valet_session_id uuid,
    actor_membership_id uuid, status text, purpose text
  ) ON COMMIT DROP`);
  await db.query(`CREATE TEMP TABLE vehicle_photo_verifications (
    operation_id uuid, vehicle_photo_id uuid, organization_id uuid,
    location_id uuid, valet_session_id uuid, captured_by_membership_id uuid,
    purpose text, verified_at timestamptz
  ) ON COMMIT DROP`);
  for (const total of [0, 1, 4, 5, 6, 9, 10]) {
    await db.query("TRUNCATE condition_photo_upload_operations, vehicle_photo_verifications");
    for (let n = 1; n <= total; n += 1) await add(n);
    const result = await readConditionPhotoEvidenceSummary(db, scope);
    assert.equal(result.verifiedTotal, total);
    assert.equal(result.latestVerified.length, Math.min(total, 4));
    assert.deepEqual(result.latestVerified.map((record) => record.operationId),
      Array.from({ length: Math.min(total, 4) }, (_, i) =>
        fixed(total - i, "ffffffff")));
    console.log(`PASS actor-scoped PostgreSQL historical total ${total}`);
  }
  await db.query("TRUNCATE condition_photo_upload_operations, vehicle_photo_verifications");
  for (let n = 1; n <= 6; n += 1) await add(n);
  await add(7, actorB);
  await add(8, actorA, sessionB);
  await add(9, actorA, sessionA, orgB);
  await add(10, actorA, sessionA, orgA, locB);
  assert.equal((await readConditionPhotoEvidenceSummary(db, scope)).verifiedTotal, 6);
  assert.equal((await readConditionPhotoEvidenceSummary(db,
    { ...scope, actorMembershipId: actorB })).verifiedTotal, 1);
  assert.equal((await readConditionPhotoEvidenceSummary(db,
    { ...scope, organizationId: orgB })).verifiedTotal, 1);
  assert.equal((await readConditionPhotoEvidenceSummary(db,
    { ...scope, locationId: locB })).verifiedTotal, 1);
  assert.equal((await readConditionPhotoEvidenceSummary(db,
    { ...scope, valetSessionId: sessionB })).verifiedTotal, 1);
  console.log("PASS actor/organization/location/session isolation in actual PostgreSQL");

  await db.query("TRUNCATE condition_photo_upload_operations, vehicle_photo_verifications");
  await add(1, actorA, sessionA, orgA, locA, "2026-10-29T00:00:00.000100Z");
  await add(2, actorA, sessionA, orgA, locA, "2026-10-29T00:00:00.000901Z");
  const micro = await readConditionPhotoEvidenceSummary(db, scope);
  assert.deepEqual(micro.latestVerified.map((record) => record.operationId),
    [fixed(2, "ffffffff"), fixed(1, "ffffffff")]);
  assert.match(micro.latestVerified[0]!.verifiedAt, /\.000901Z$/);
  console.log("PASS microsecond exact sort and metadata response");
} finally {
  await db.query("ROLLBACK").catch(() => undefined);
  db.release();
  await pool.end();
}
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
