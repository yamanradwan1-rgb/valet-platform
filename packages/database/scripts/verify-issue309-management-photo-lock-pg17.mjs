// Opt-in integration proof against a dedicated disposable PostgreSQL 17 Docker
// container; never point this script at a shared or production database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import pg from "pg";

const containerName = "vaylet-309-w9-pg17";
const adminUrl = process.env.VAYLET_ISSUE309_DISPOSABLE_PG17_ADMIN_URL;
const runtimeUrl = process.env.VAYLET_ISSUE309_DISPOSABLE_PG17_RUNTIME_URL;
if (process.env.NODE_ENV !== "test" || !adminUrl || !runtimeUrl) {
  throw new Error("Issue #309 PostgreSQL 17 proof requires explicit disposable test credentials.");
}
const adminTarget = new URL(adminUrl);
const runtimeTarget = new URL(runtimeUrl);
if (adminTarget.hostname !== "127.0.0.1" ||
    runtimeTarget.hostname !== adminTarget.hostname ||
    runtimeTarget.port !== adminTarget.port ||
    runtimeTarget.pathname !== adminTarget.pathname ||
    adminTarget.username !== "postgres" || runtimeTarget.username === "postgres" ||
    adminTarget.search || runtimeTarget.search ||
    adminTarget.pathname !== "/postgres") {
  throw new Error("Issue #309 proof rejected the PostgreSQL test target.");
}
const inspected = JSON.parse(execFileSync("docker", ["inspect", containerName], {
  encoding: "utf8", timeout: 5_000, windowsHide: true,
}));
const actual = inspected[0];
if (actual?.Name !== `/${containerName}` || actual.State?.Status !== "running" ||
    actual.Config?.Image !== "postgres:17-alpine" ||
    actual.NetworkSettings?.Ports?.["5432/tcp"]?.[0]?.HostIp !== "127.0.0.1" ||
    actual.NetworkSettings.Ports["5432/tcp"][0].HostPort !== adminTarget.port) {
  throw new Error("Issue #309 Docker target does not match the disposable instance.");
}

const admin = new pg.Client({ connectionString: adminUrl });
const reader = new pg.Client({ connectionString: runtimeUrl });
const writer = new pg.Client({ connectionString: adminUrl });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;

async function seed() {
  const org = randomUUID(), location = randomUUID(), member = randomUUID();
  const user = randomUUID(), session = randomUUID(), vehicle = randomUUID();
  await admin.query(
    "INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES($1,'W9 disposable PG17','ACTIVE','Asia/Amman',clock_timestamp())",
    [org],
  );
  await admin.query(
    "INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'test-only','ACTIVE',clock_timestamp())",
    [user, `${user}@issue309.test.invalid`],
  );
  await admin.query(
    `INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at)
     VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())`,
    [member,org,user],
  );
  await admin.query(
    `INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at)
     VALUES($1,$2,'W9 location',$3,'Test','Asia/Amman','JOD','ACTIVE',clock_timestamp())`,
    [location,org,randomUUID()],
  );
  await admin.query(
    "INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)",
    [org,member,location],
  );
  await admin.query(
    "INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'W9 synthetic',clock_timestamp())",
    [vehicle,org],
  );
  await admin.query(
    `INSERT INTO valet_sessions(id,customer_access_token_hash,customer_access_expires_at,
      organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,updated_at)
     VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'CHECKING_IN',$6,clock_timestamp())`,
    [session,`issue309:${randomUUID()}`,org,location,vehicle,member],
  );
  const reserved = await admin.query(
    `SELECT * FROM public.condition_photo_reserve_upload(
       $1::uuid,$2::uuid,$3::uuid,$4::uuid,decode(repeat('a',64),'hex'),256,1,'issue309_test')`,
    [user,member,session,randomUUID()],
  );
  const item = reserved.rows[0];
  assert.ok(item);
  const operationArgs = [user,member,item.operation_id,item.attempt_id,item.lease_owner];
  await admin.query(
    `SELECT public.condition_photo_mark_stored($1::uuid,$2::uuid,$3::uuid,$4::uuid,
     $5::uuid,'pg17-exact-version',decode(repeat('b',64),'hex'),256,10,10)`,
    operationArgs,
  );
  const completed = await admin.query(
    `SELECT public.condition_photo_finalize_upload($1::uuid,$2::uuid,$3::uuid,$4::uuid,
     $5::uuid,'pg17-exact-version',decode(repeat('b',64),'hex'),256,10,10)::text AS photo_id`,
    operationArgs,
  );
  const photoId = completed.rows[0]?.photo_id;
  assert.ok(photoId);
  const stored = await admin.query(
    `SELECT v.vehicle_photo_id,v.organization_id,v.location_id,v.valet_session_id,
       v.operation_id,v.attempt_id,v.captured_by_membership_id,v.object_key,
       v.content_sha256,v.byte_size,a.bucket_alias,a.object_version
     FROM vehicle_photo_verifications v
     JOIN condition_photo_upload_attempts a ON a.id=v.attempt_id
     WHERE v.vehicle_photo_id=$1`, [photoId],
  );
  const proof = stored.rows[0];
  assert.ok(proof);
  const args = [proof.vehicle_photo_id,proof.organization_id,proof.location_id,
    proof.valet_session_id,proof.operation_id,proof.attempt_id,
    proof.captured_by_membership_id,proof.object_key,proof.content_sha256,
    proof.byte_size,proof.bucket_alias,proof.object_version];
  return { photoId, args };
}

async function check(client, args) {
  const result = await client.query(
    `SELECT public.condition_photo_lock_management_evidence(
      $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,
      $7::uuid,$8::text,$9::bytea,$10::integer,$11::text,$12::text) AS qualifies`,
    args,
  );
  return result.rows[0]?.qualifies;
}

try {
  await Promise.all([admin.connect(), reader.connect(), writer.connect()]);
  const version = await admin.query("SELECT current_setting('server_version_num')::integer AS version");
  assert.ok(version.rows[0]?.version >= 170000 && version.rows[0]?.version < 180000);
  const role = await admin.query(
    `SELECT r.rolcanlogin,r.rolinherit,p.prosecdef,
        has_function_privilege($1,p.oid,'EXECUTE') AS runtime_execute,
        has_any_column_privilege($1,'public.vehicle_photo_verifications','UPDATE') AS runtime_update
       FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
       WHERE p.proname='condition_photo_lock_management_evidence'`, [runtimeTarget.username],
  );
  assert.deepEqual(role.rows[0], {
    rolcanlogin: false, rolinherit: false, prosecdef: true,
    runtime_execute: true, runtime_update: false,
  });
  passed += 1;

  const first = await seed();
  assert.equal(await check(reader, first.args), true);
  passed += 1;
  for (const index of [1,2,7,10,11]) {
    const wrong = [...first.args];
    wrong[index] = index <= 2 ? randomUUID() : `different-value-${index}`;
    assert.equal(await check(reader, wrong), false);
  }
  const wrongHash = [...first.args];
  wrongHash[8] = Buffer.alloc(32, 0);
  assert.equal(await check(reader, wrongHash), false);
  passed += 1;

  // Revoker-first: the reader waits, then observes the committed UNAVAILABLE.
  await writer.query("BEGIN");
  await writer.query(
    "SELECT public.condition_photo_maintenance_mark_unavailable($1::uuid,'CONTENT_MISMATCH')",
    [first.photoId],
  );
  const pendingReader = check(reader, first.args);
  const readerBlocked = await Promise.race([pendingReader.then(() => false), delay(120).then(() => true)]);
  assert.equal(readerBlocked, true);
  await writer.query("COMMIT");
  assert.equal(await pendingReader, false);
  passed += 1;

  // Reader-first: hold SHARE until HTTP enqueue transaction finishes, then
  // the canonical #215 maintenance revoker can mark the object unavailable.
  const second = await seed();
  await reader.query("BEGIN ISOLATION LEVEL READ COMMITTED");
  assert.equal(await check(reader, second.args), true);
  const pendingRevocation = writer.query(
    "SELECT public.condition_photo_maintenance_mark_unavailable($1::uuid,'CONTENT_MISMATCH') AS changed",
    [second.photoId],
  );
  const revokerBlocked = await Promise.race([
    pendingRevocation.then(() => false), delay(120).then(() => true),
  ]);
  assert.equal(revokerBlocked, true);
  await reader.query("COMMIT");
  assert.equal((await pendingRevocation).rows[0]?.changed, true);
  assert.equal(await check(reader, second.args), false);
  passed += 1;
  console.log(`VAYLET #309 isolated PostgreSQL 17 lock proof PASS ${passed}/5`);
} finally {
  await Promise.allSettled([reader.query("ROLLBACK"), writer.query("ROLLBACK")]);
  await Promise.allSettled([reader.end(), writer.end(), admin.end()]);
}
