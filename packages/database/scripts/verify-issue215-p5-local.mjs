// Standalone P5 proof using exclusively self-created, attested ephemeral Docker.
// Neither shared PostgreSQL nor existing test-harness ownership is ever targeted.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

import { Pool } from "pg";
import { proveMaintenanceAvailabilityFact } from "./verify-issue215-p5-photo-fact.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const prisma = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
const docker = (...args) => execFileSync("docker", args, {
  encoding: "utf8", windowsHide: true, timeout: 30_000,
});
const unique = () => randomUUID().replaceAll("-", "");
const roleUrl = (base, role, password) => {
  const url = new URL(base);
  url.username = role;
  url.password = password;
  return url.toString();
};

function inspectOwned(id, name, owner, pinnedImage) {
  const [actual] = JSON.parse(docker("inspect", id));
  const ports = actual?.NetworkSettings?.Ports?.["5432/tcp"];
  assert.equal(actual?.Id, id);
  assert.equal(actual?.Name, `/${name}`);
  assert.equal(actual?.Image, pinnedImage);
  assert.equal(actual?.Config?.Labels?.["vaylet.task"], "issue215-p5");
  assert.equal(actual?.Config?.Labels?.["vaylet.owner"], owner);
  assert.equal(actual?.State?.Running, true);
  assert.equal(actual?.HostConfig?.Tmpfs?.["/var/lib/postgresql/data"], "rw,noexec,nosuid,size=512m");
  assert.equal(actual?.Mounts?.some((mount) => mount.Type === "bind"), false);
  assert.equal(ports?.length, 1);
  assert.equal(ports[0]?.HostIp, "127.0.0.1");
  const port = Number(ports[0].HostPort);
  assert.ok(Number.isSafeInteger(port) && port > 1024);
  return port;
}

async function connected(url, id, name, owner, pinnedImage) {
  inspectOwned(id, name, owner, pinnedImage);
  for (let attempt = 0; attempt < 60; attempt++) {
    const pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 1000 });
    try {
      const result = await pool.query(`SELECT current_database() AS db,
         current_user AS actor,pg_is_in_recovery() AS recovery`);
      assert.deepEqual(result.rows[0], { db: "p5_only", actor: "p5_owner", recovery: false });
      return pool;
    } catch (error) {
      await pool.end().catch(() => {});
      if (attempt === 59) throw new Error("Owned PostgreSQL could not become ready.", { cause: error });
      await delay(500);
    }
  }
  throw new Error("Unreachable PostgreSQL wait state.");
}

function migrate(url) {
  try {
    execFileSync(process.execPath, [prisma, "migrate", "deploy"], {
      cwd: packageRoot, windowsHide: true, timeout: 180_000, stdio: "pipe",
      env: {
        ...process.env, NODE_ENV: "test", DATABASE_URL: undefined,
        MIGRATION_DATABASE_URL: url, PGHOST: undefined, PGPORT: undefined,
        PGDATABASE: undefined, PGUSER: undefined, PGSERVICE: undefined,
      },
    });
  } catch (error) {
    const output = String(error.stdout ?? "") + String(error.stderr ?? "");
    const short = output.replaceAll(new URL(url).password, "[redacted]").slice(-1600);
    throw new Error(`Owned photo maintenance migrations rejected: ${short}`);
  }
}

async function provision(url, ownerPool) {
  const runtimeRole = `p5_runtime_${unique().slice(0, 16)}`;
  const maintenanceRole = `p5_maintenance_${unique().slice(0, 16)}`;
  const runtimePassword = randomBytes(24).toString("hex");
  const maintenancePassword = randomBytes(24).toString("hex");
  for (const [role, password] of [
    [runtimeRole, runtimePassword], [maintenanceRole, maintenancePassword],
  ]) {
    const formatted = await ownerPool.query(
      "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS', $1::text, $2::text) AS sql",
      [role, password],
    );
    await ownerPool.query(formatted.rows[0].sql);
  }
  const env = {
    ...process.env, NODE_ENV: "test", MIGRATION_DATABASE_URL: url,
    DATABASE_URL: roleUrl(url, runtimeRole, runtimePassword),
    CONDITION_PHOTO_MAINTENANCE_DATABASE_URL: roleUrl(url, maintenanceRole, maintenancePassword),
    CONDITION_PHOTO_MAINTENANCE_ROLE: maintenanceRole,
  };
  for (const script of [
    "provision-runtime-role.mjs", "provision-condition-photo-maintenance-role.mjs",
  ]) {
    try {
      execFileSync(process.execPath, [`scripts/${script}`], {
        cwd: packageRoot, env, stdio: "pipe", timeout: 60_000, windowsHide: true,
      });
    } catch (error) {
      throw new Error(`Owned P5 restricted provision failed (${script}): ${String(error.stderr ?? "").slice(-800)}`);
    }
  }
  return { runtimeRole, maintenanceRole, maintenanceUrl: env.CONDITION_PHOTO_MAINTENANCE_DATABASE_URL };
}

async function seed(pool) {
  const ids = {
    org: randomUUID(), location: randomUUID(), member: randomUUID(),
    user: randomUUID(), vehicle: randomUUID(), session: randomUUID(),
  };
  await pool.query("INSERT INTO organizations(id,name,status,timezone,updated_at) VALUES($1,'P5 isolated','ACTIVE','Asia/Amman',clock_timestamp())", [ids.org]);
  await pool.query("INSERT INTO users(id,email,password_hash,status,updated_at) VALUES($1,$2,'test-only','ACTIVE',clock_timestamp())", [ids.user, `${ids.user}@test.invalid`]);
  await pool.query("INSERT INTO organization_memberships(id,organization_id,user_id,role,status,updated_at) VALUES($1,$2,$3,'VALET_EMPLOYEE','ACTIVE',clock_timestamp())", [ids.member, ids.org, ids.user]);
  await pool.query("INSERT INTO locations(id,organization_id,name,code,address_text,timezone,currency,status,updated_at) VALUES($1,$2,'P5 location',$3,'test','Asia/Amman','JOD','ACTIVE',clock_timestamp())", [ids.location, ids.org, unique()]);
  await pool.query("INSERT INTO membership_location_access(organization_id,membership_id,location_id) VALUES($1,$2,$3)", [ids.org, ids.member, ids.location]);
  await pool.query("INSERT INTO vehicles(id,organization_id,temporary_descriptor,updated_at) VALUES($1,$2,'P5 vehicle',clock_timestamp())", [ids.vehicle, ids.org]);
  await pool.query("INSERT INTO valet_sessions(id,customer_access_token_hash,customer_access_expires_at,organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,updated_at) VALUES($1,$2,clock_timestamp()+interval '1 hour',$3,$4,$5,'CHECKING_IN',$6,clock_timestamp())", [ids.session, `p5:${unique()}`, ids.org, ids.location, ids.vehicle, ids.member]);
  return ids;
}

async function expiredAttempt(pool, ids) {
  const operation = randomUUID();
  const attempt = randomUUID();
  const key = `condition-photo/${operation}/${attempt}`;
  await pool.query(`INSERT INTO condition_photo_upload_operations
    (id,client_operation_id,organization_id,location_id,valet_session_id,
     actor_membership_id,source_sha256,source_byte_size,normalization_version,
     created_at,expires_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,256,1,clock_timestamp()-interval '10 minutes',
     clock_timestamp()-interval '1 minute',clock_timestamp()-interval '10 minutes')`,
    [operation, randomUUID(), ids.org, ids.location, ids.session, ids.member, Buffer.alloc(32,7)]);
  await pool.query(`INSERT INTO condition_photo_upload_attempts
    (id,operation_id,organization_id,location_id,valet_session_id,actor_membership_id,
     attempt_number,object_key,bucket_alias,lease_owner,lease_expires_at,
     normalization_version)
    VALUES($1,$2,$3,$4,$5,$6,1,$7,'p5_owned', $8,
      clock_timestamp()-interval '2 minutes',1)`,
    [attempt,operation,ids.org,ids.location,ids.session,ids.member,key,randomUUID()]);
  return { operation, attempt, key };
}

async function prove(pool, maintenanceUrl, maintenanceRole, runtimeRole) {
  const maintenance = new Pool({ connectionString: maintenanceUrl, max: 4 });
  try {
    const privilege = await pool.query(`SELECT
      has_function_privilege($1,
        'public.condition_photo_maintenance_mark_unavailable(uuid,text)','EXECUTE') AS can_integrity,
      has_function_privilege($1,
        'public.condition_photo_finalize_upload(uuid,uuid,uuid,uuid,uuid,text,bytea,integer,integer,integer)',
        'EXECUTE') AS can_finalize,
      has_function_privilege($2,
        'public.condition_photo_maintenance_claim_abandoned(uuid,uuid,text)','EXECUTE') AS runtime_can_claim,
      has_table_privilege($1,'public.condition_photo_upload_attempts','SELECT') AS can_select,
      has_table_privilege($1,'public.condition_photo_cleanup_claims','UPDATE') AS can_update`,
      [maintenanceRole, runtimeRole]);
    assert.deepEqual(privilege.rows[0], {
      can_integrity: true, can_finalize: false, runtime_can_claim: false,
      can_select: false, can_update: false,
    });
    for (const signature of [
      "public.condition_photo_coherence_guard()",
      "public.condition_photo_audit_coherence_guard()",
    ]) {
      const catalog = await pool.query(`SELECT p.prosecdef AS security_definer,
        pg_get_userbyid(p.proowner) AS owner,p.proconfig AS config,
        has_function_privilege($1,p.oid,'EXECUTE') AS maint_execute,
        has_function_privilege($2,p.oid,'EXECUTE') AS runtime_execute,
        EXISTS (SELECT 1 FROM aclexplode(p.proacl) acl WHERE acl.grantee=0
          AND acl.privilege_type='EXECUTE') AS public_execute
        FROM pg_proc p WHERE p.oid=$3::regprocedure`,
        [maintenanceRole,runtimeRole,signature]);
      assert.deepEqual(catalog.rows[0], {
        security_definer: true,owner:"p5_owner",
        config:["search_path=pg_catalog, public"],
        maint_execute:false,runtime_execute:false,public_execute:false,
      });
    }
    const ids = await seed(pool);
    await proveMaintenanceAvailabilityFact(pool,maintenance,ids);
    const record = await expiredAttempt(pool, ids);
    const candidates = await maintenance.query(
      "SELECT * FROM condition_photo_maintenance_expired_candidates(100)");
    assert.ok(candidates.rows.some((row) => row.operation_id === record.operation));
    const expired = await maintenance.query(
      "SELECT condition_photo_expire_operation($1::uuid) AS ok", [record.operation]);
    assert.equal(expired.rows[0].ok, true);
    const claims = await Promise.all([randomUUID(), randomUUID()].map((id) =>
      maintenance.query(
        "SELECT * FROM condition_photo_maintenance_claim_abandoned($1::uuid,$2::uuid,'p5_owned')",
        [record.attempt,id])));
    assert.equal(claims.reduce((sum, result) => sum+result.rows.length,0),1);
    const claim = claims.flatMap((result) => result.rows)[0];
    assert.equal(claim.selected, false);
    assert.equal(claim.legacy_referenced, false);
    assert.equal(claim.object_key, record.key);
    const finished = await maintenance.query(
      "SELECT condition_photo_maintenance_finish_claim($1::uuid,$2::uuid) AS ok",
      [record.attempt,claim.claim_id]);
    assert.equal(finished.rows[0].ok,true);
    const replay = await maintenance.query(
      "SELECT condition_photo_maintenance_finish_claim($1::uuid,$2::uuid) AS ok",
      [record.attempt,claim.claim_id]);
    assert.equal(replay.rows[0].ok,false);
    const second = await expiredAttempt(pool,ids);
    await maintenance.query("SELECT condition_photo_expire_operation($1::uuid)",[second.operation]);
    await pool.query(`INSERT INTO vehicle_photos
      (id,organization_id,location_id,valet_session_id,captured_by_membership_id,
       purpose,storage_object_key,content_type)
      VALUES($1,$2,$3,$4,$5,'CHECK_IN_CONDITION',$6,'image/jpeg')`,
      [randomUUID(),ids.org,ids.location,ids.session,ids.member,second.key]);
    const alias = await maintenance.query(
      "SELECT * FROM condition_photo_maintenance_claim_abandoned($1::uuid,$2::uuid,'p5_owned')",
      [second.attempt,randomUUID()]);
    assert.equal(alias.rowCount,0);
    const thirdIds = await seed(pool);
    const third = await expiredAttempt(pool,thirdIds);
    await maintenance.query("SELECT condition_photo_expire_operation($1::uuid)",[third.operation]);
    await pool.query(`INSERT INTO incidents
      (id,organization_id,location_id,valet_session_id,status,severity,type,
       description,reported_by_membership_id)
      VALUES($1,$2,$3,$4,'OPEN','LOW','P5_TEST','isolated',$5)`,
      [randomUUID(),thirdIds.org,thirdIds.location,thirdIds.session,thirdIds.member]);
    const held = await maintenance.query(
      "SELECT * FROM condition_photo_maintenance_claim_abandoned($1::uuid,$2::uuid,'p5_owned')",
      [third.attempt,randomUUID()]);
    assert.equal(held.rowCount,0);
    const noCandidate = await maintenance.query(
      "SELECT * FROM condition_photo_maintenance_available_candidates(10,NULL::uuid)");
    assert.equal(noCandidate.rowCount,0);
    const unavailable = await maintenance.query(
      "SELECT condition_photo_maintenance_mark_unavailable($1::uuid,'CONTENT_MISMATCH') AS changed",
      [randomUUID()]);
    assert.equal(unavailable.rows[0].changed,false);
    const migrations = await pool.query(`SELECT count(*)::int AS total FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    return { migrations: migrations.rows[0].total, cases: 23 };
  } finally { await maintenance.end(); }
}

async function run(version) {
  const image = JSON.parse(docker("image", "inspect", version))[0];
  assert.ok(image?.Id?.startsWith("sha256:"));
  const owner = randomUUID();
  const name = `issue215-p5-pg-${unique().slice(0, 14)}`;
  const password = randomBytes(24).toString("hex");
  let containerId;
  let pool;
  try {
    containerId = docker("run", "--rm", "-d", "--pull", "never",
      "--name",name,"--label","vaylet.task=issue215-p5",
      "--label",`vaylet.owner=${owner}`,
      "--tmpfs","/var/lib/postgresql/data:rw,noexec,nosuid,size=512m",
      "-p","127.0.0.1::5432", "-e","POSTGRES_USER=p5_owner",
      "-e",`POSTGRES_PASSWORD=${password}`,"-e","POSTGRES_DB=p5_only",
      image.Id).trim();
    const port = inspectOwned(containerId,name,owner,image.Id);
    const url = `postgresql://p5_owner:${password}@127.0.0.1:${port}/p5_only`;
    pool = await connected(url,containerId,name,owner,image.Id);
    migrate(url);
    const roles = await provision(url,pool);
    const proof = await prove(pool,roles.maintenanceUrl,roles.maintenanceRole,roles.runtimeRole);
    return { version, ...proof };
  } finally {
    await pool?.end();
    if (containerId) {
      inspectOwned(containerId,name,owner,image.Id);
      docker("rm","--force",containerId);
    }
  }
}

for (const version of ["postgres:16-alpine", "postgres:17-alpine"]) {
  const proof = await run(version);
  process.stdout.write(`P5 isolated ${proof.version}: ${proof.migrations} migrations; ${proof.cases} claims/role/incident negative assertions PASS; owned container removed\n`);
}
