// Only accepted operational HTTP commands count as writers; never synthetic SQL.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { readTarget, assertOwnedUri } from "./issue300-w8-target.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { Client } = createRequire(resolve(root, "apps/api/package.json"))("pg");
const isUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const p95 = (items) => [...items].sort((a,b)=>a-b)[Math.ceil(items.length*.95)-1];

export function assertWriterRoster(roster, target, required) {
  assert(Array.isArray(roster) && roster.length === required);
  assert.equal(new Set(roster.map((c)=>c.clientId)).size, required);
  assert.equal(new Set(roster.map((c)=>c.sessionId)).size, required);
  for (const c of roster) {
    assert.match(c.clientId, /^[a-z0-9-]{8,}$/);
    assert.match(c.sessionId, isUuid);
    assert.match(c.membershipId, isUuid);
    assert.match(c.bearer ?? "", /^vsa1\.[A-Za-z0-9_-]{43}$/);
    assert(["INCIDENT_REPORT","KEY_SLOT_ASSIGN"].includes(c.command));
    if (c.command === "KEY_SLOT_ASSIGN") {
      assert(Array.isArray(c.keySlots) && c.keySlots.length >= 2);
      assert(c.keySlots.every((s)=>typeof s === "string" && s.length > 0));
    }
    assert.equal(c.organizationId, target.scope.organizationId);
    assert.equal(c.locationId, target.scope.locationId);
  }
  return roster;
}

async function post(api, origin, roster, path, body) {
  const reply = await fetch(new URL(path,api), {
    method:"POST", headers: {
      Origin:origin, Authorization:`Bearer ${roster.bearer}`,
      "Content-Type":"application/json",
    }, body:JSON.stringify(body),signal:AbortSignal.timeout(15_000),
  });
  const json = await reply.json().catch(()=>null);
  assert.equal(reply.status,200,`operational HTTP status ${reply.status}`);
  return json;
}

async function command(api, origin, c, db, runIndex) {
  if (c.command === "INCIDENT_REPORT") {
    const incidentId = randomUUID();
    const path = `/v1/staff/valet-sessions/${c.sessionId}/incidents`;
    const body = {incidentId, type:"KEY_MISSING", severity:"LOW",
      description:"W8 disposable operational writer, private"};
    const result = await post(api,origin,c,path,body);
    assert.equal(result?.incidentId,incidentId);
    const replay = await post(api,origin,c,path,body);
    assert.deepEqual(replay,result,"Incident idempotent retry diverged");
    const readback = (await db.query(`SELECT i.pagination_birth_xid::text AS ib,
      a.pagination_birth_xid::text AS ab,
      i.valet_session_id AS sid, i.reported_by_membership_id AS actor,
      a.id AS audit_id,a.valet_session_id AS audit_session,
      a.actor_membership_id AS audit_actor
      FROM incidents i JOIN audit_events a
        ON a.entity_type IN ('Incident','INCIDENT')
        AND a.entity_id=i.id AND a.event_type='INCIDENT_OPENED'
        AND a.organization_id=i.organization_id
        AND a.location_id=i.location_id
        AND a.valet_session_id=i.valet_session_id
      WHERE i.id=$1::uuid AND i.organization_id=$2::uuid
        AND i.location_id=$3::uuid`,
    [incidentId,c.organizationId,c.locationId])).rows;
    assert.equal(readback.length,1);
    assert.equal(readback[0].sid,c.sessionId);
    assert.equal(readback[0].actor,c.membershipId);
    assert.equal(readback[0].audit_actor,c.membershipId);
    assert.equal(readback[0].audit_session,c.sessionId);
    assert(readback[0].ib && readback[0].ab);
    return {sourceIds:[incidentId,readback[0].audit_id],
      source:"INCIDENT+AUDIT",idempotencyVerified:true};
  }
  const before = (await db.query(`SELECT version FROM valet_sessions
    WHERE id=$1::uuid AND organization_id=$2::uuid AND location_id=$3::uuid`,
  [c.sessionId,c.organizationId,c.locationId])).rows[0];
  assert(Number.isInteger(before?.version));
  const previousCustody = (await db.query(`SELECT id::text AS id
    FROM key_custody_events WHERE organization_id=$1::uuid
      AND location_id=$2::uuid AND valet_session_id=$3::uuid`,
    [c.organizationId,c.locationId,c.sessionId])).rows.map((r)=>r.id);
  const previousAudit = (await db.query(`SELECT id::text AS id
    FROM audit_events WHERE organization_id=$1::uuid
      AND location_id=$2::uuid AND valet_session_id=$3::uuid
      AND event_type IN ('VALET_SESSION_KEY_SLOT_ASSIGNED',
        'VALET_SESSION_KEY_SLOT_REASSIGNED')`,
    [c.organizationId,c.locationId,c.sessionId])).rows.map((r)=>r.id);
  const slotCode = c.keySlots[runIndex % c.keySlots.length];
  const result = await post(api,origin,c,
    `/v1/staff/valet-sessions/${c.sessionId}/key-slot/assign`,
    {expectedVersion:before.version,keySlotCode:slotCode});
  assert.equal(result.version,before.version+1);
  assert.equal(result.keySlotCode,slotCode);
  const custody = (await db.query(`SELECT custody.id::text AS id
    FROM key_custody_events custody JOIN key_slots slot
      ON slot.id=custody.key_slot_id AND slot.organization_id=custody.organization_id
      AND slot.location_id=custody.location_id
    WHERE custody.valet_session_id=$1::uuid
      AND custody.organization_id=$2::uuid AND custody.location_id=$3::uuid
      AND custody.actor_membership_id=$4::uuid
      AND custody.event_type='SLOT_ASSIGNED'
      AND slot.code=$5::text AND custody.pagination_birth_xid IS NOT NULL
      AND NOT(custody.id=ANY($6::uuid[]))`,
    [c.sessionId,c.organizationId,c.locationId,c.membershipId,
      slotCode,previousCustody])).rows;
  assert.equal(custody.length,1,
    "Each key operation must create exactly one NEW assigned-slot event");
  const audit = (await db.query(`SELECT id::text AS id
    FROM audit_events WHERE valet_session_id=$1::uuid
      AND organization_id=$2::uuid AND location_id=$3::uuid
      AND actor_membership_id=$4::uuid AND pagination_birth_xid IS NOT NULL
      AND event_type IN ('VALET_SESSION_KEY_SLOT_ASSIGNED',
        'VALET_SESSION_KEY_SLOT_REASSIGNED')
      AND NOT(id=ANY($5::uuid[]))`,
    [c.sessionId,c.organizationId,c.locationId,c.membershipId,
      previousAudit])).rows;
  assert.equal(audit.length,1,"Exactly one NEW canonical slot Audit is required");
  return {source:"KEY_CUSTODY+AUDIT",
    sourceIds:[custody[0].id,audit[0].id]};
}

async function main() {
  const target = readTarget();
  const mode = process.env.ISSUE300_W8_WRITER_MODE;
  assert(["baseline","normal","stress"].includes(mode));
  const required = mode === "baseline" ?
    Number(process.env.ISSUE300_W8_BASELINE_WRITERS) :
    (mode === "stress" ? 8 : 2);
  assert([2,8].includes(required));
  assertOwnedUri(process.env.ISSUE300_W8_API_URL,target,"api");
  assertOwnedUri(process.env.ISSUE300_W8_ORIGIN,target,"dashboard");
  assertOwnedUri(process.env.ISSUE300_W8_RUNTIME_DB_URL,target,"db");
  const rosterPath = realpathSync(process.env.ISSUE300_W8_WRITER_ROSTER);
  assert(rosterPath.toLowerCase().startsWith(
    target.resource.dataPath.toLowerCase()));
  const all = JSON.parse(readFileSync(rosterPath,"utf8"));
  const roster = assertWriterRoster(all.clients?.slice(0,required),target,required);
  assert.equal(all.candidateSha,target.candidateSha);
  assert.equal(all.leaseId,target.leaseId);
  const raw = [];
  const errors = [];
  const clientProof = {};
  let stop = false;
  const start = performance.now();
  const startedAt = new Date().toISOString();
  const api = new URL(process.env.ISSUE300_W8_API_URL);
  const origin = process.env.ISSUE300_W8_ORIGIN;
  const minDuration = mode === "baseline" ? 600_000 : 630_000;
  const perClient = async (c) => {
    const db = new Client({connectionString:process.env.ISSUE300_W8_RUNTIME_DB_URL,
      application_name:"issue300_w8_real_http_writer",statement_timeout:12_000});
    await db.connect();
    let succeeded = 0, index = 0;
    try {
      while (performance.now()-start < minDuration && !stop) {
        const began = performance.now();
        try {
          const evidence = await command(api,origin,c,db,index++);
          raw.push({clientId:c.clientId,elapsedMs:performance.now()-began,
            at:new Date().toISOString(),command:c.command,
            sourceIds:evidence.sourceIds,
            idempotencyVerified:evidence.idempotencyVerified===true});
          succeeded++;
        } catch (error) {
          errors.push({clientId:c.clientId,category:error.code ?? "FAILED_COMMAND"});
          stop = true;
          break;
        }
        // Bounded writer rate; no runaway flood on a shared machine.
        await new Promise((resolve) => setTimeout(resolve,Math.max(0,1000-
          (performance.now()-began))));
      }
      clientProof[c.clientId] = succeeded;
    } finally {await db.end();}
  };
  await Promise.all(roster.map(perClient));
  const finishedAt = new Date().toISOString();
  const elapsedMs = performance.now()-start;
  const times = raw.map((r)=>r.elapsedMs);
  const report = {
    candidateSha:target.candidateSha,leaseId:target.leaseId,
    database:target.resource.database,hardwareId:target.resource.hardwareId,
    containerId:target.resource.containerId,
    apiBundleSha256:target.resource.apiBundleSha256,
    targetTier:target.targetTier,
    sourceFixtureHash:target.sourceFixtureHash,mode,
    writerKind:"ACTUAL_OPERATIONAL_HTTP_OR_DOMAIN_COMMAND",
    writerClients:required,writerClientIds:roster.map((c)=>c.clientId),
    startedAt,finishedAt,elapsedMs,successfulCommands:times.length,
    failedCommands:errors.length,deadlocks:errors.filter((e)=>e.category==="40P01").length,
    lockTimeouts:errors.filter((e)=>e.category==="55P03").length,
    p95Ms:times.length?p95(times):null,raw,clientProof,
    errors:errors.map((e)=>e.category),
  };
  assert(process.env.ISSUE300_W8_WRITER_RESULT_PATH);
  writeFileSync(process.env.ISSUE300_W8_WRITER_RESULT_PATH,
    JSON.stringify(report,null,2),{flag:"wx",mode:0o600});
  assert(elapsedMs >= minDuration && errors.length===0 &&
    Object.values(clientProof).every((n)=>n>0));
  console.log(JSON.stringify({verdict:"PASS_REAL_WRITER_ONLY",
    mode,writerClients:required,successfulCommands:times.length,p95Ms:report.p95Ms}));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error)=>{console.error("W8 writer proof blocked:",error.message);
    process.exitCode=1;});
