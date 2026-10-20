// Deterministic SYNTHETIC history only. Not proof of real canonical writers.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { readTarget, assertOwnedUri } from "./issue300-w8-target.mjs";
import { fixtureFirstAt } from "./issue300-w8-cohort-window.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { Client } = createRequire(resolve(root, "apps/api/package.json"))("pg");
const family = ["AUDIT", "KEY_CUSTODY", "DISPATCH", "INCIDENT"];
const uuid = (seed, kind, n) => {
  const hex = createHash("md5").update(`${seed}:${kind}:${n}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
const limit = 5_000;
const countSql = {
  AUDIT: "audit_events", KEY_CUSTODY: "key_custody_events",
  DISPATCH: "dispatch_events", INCIDENT: "incidents",
};

export function fixturePlan(tier) {
  assert([100_000, 1_000_000].includes(tier), "Exact U004 tier required");
  const perFamily = tier / family.length;
  return { tier, sessions: tier / 100, perFamily,
    targetCounts: Object.fromEntries(family.map((k) => [k, perFamily])) };
}

export function fixtureStatement(kind) {
  assert(family.includes(kind));
  const common = `md5($5::text || ':' || $1::text || ':' || i::text)::uuid,
    $2::uuid, $3::uuid,
    md5($5::text || ':session:' ||
      (1 + ((i - 1) % $6::int))::text)::uuid`;
  const series = "FROM generate_series($7::int, $8::int) AS i";
  const when = `'${fixtureFirstAt}'::timestamptz + (i % 60) * interval '1 second'`;
  const who = "$4::uuid";
  if (kind === "AUDIT") return `INSERT INTO audit_events
      (id,organization_id,location_id,valet_session_id,actor_membership_id,
       actor_type,event_type,entity_type,entity_id,metadata_json,occurred_at)
    SELECT ${common},${who},'MEMBERSHIP','VALET_SESSION_PARKED',
      'ValetSession',
      md5($5::text || ':session:' ||
        (1 + ((i - 1) % $6::int))::text)::uuid,
      '{}'::jsonb,${when} ${series}`;
  if (kind === "KEY_CUSTODY") return `INSERT INTO key_custody_events
      (id,organization_id,location_id,valet_session_id,key_slot_id,
       actor_membership_id,event_type,occurred_at)
    SELECT ${common},$9::uuid,${who},'CHECKED_OUT',${when} ${series}`;
  if (kind === "DISPATCH") return `INSERT INTO dispatch_events
      (id,organization_id,location_id,valet_session_id,task_id,
       actor_membership_id,new_assignee_membership_id,event_type,occurred_at)
    SELECT ${common},
      md5($5::text || ':task:' ||
        (1 + ((i - 1) % $6::int))::text)::uuid,
      ${who},${who},'ASSIGNED',${when} ${series}`;
  return `INSERT INTO incidents
    (id,organization_id,location_id,valet_session_id,status,severity,type,
     description,reported_by_membership_id,created_at)
    SELECT ${common},'OPEN','LOW','KEY_MISSING',
      'W8 synthetic, not operational incident',${who},${when} ${series}`;
}

async function verify(client, m, seed, plan) {
  const rows = {};
  for (const k of family) {
    const t = countSql[k];
    const count = await client.query(`SELECT count(*)::int AS n FROM ${t}
      WHERE organization_id=$1::uuid AND location_id=$2::uuid
        AND id = ANY($3::uuid[])`, [
      m.scope.organizationId, m.scope.locationId, [
        uuid(seed, k, 1), uuid(seed, k, plan.perFamily),
      ],
    ]);
    assert.equal(count.rows[0].n, 2, "Boundary source IDs not persisted");
    const actual = await client.query(`SELECT count(*)::int AS n FROM ${t}
      WHERE organization_id=$1::uuid AND location_id=$2::uuid
        AND id IN (SELECT md5($3::text || ':' || $4::text ||
          ':' || i::text)::uuid FROM generate_series(1,$5::int) i)`, [
      m.scope.organizationId, m.scope.locationId, seed, k, plan.perFamily,
    ]);
    assert.equal(actual.rows[0].n, plan.perFamily,
      "Full deterministic source count must match, not just boundaries");
    rows[k] = actual.rows[0].n;
  }
  return rows;
}

async function run() {
  const m = readTarget();
  const plan = fixturePlan(Number(process.env.ISSUE300_W8_TIER));
  assert.equal(m.targetTier, plan.tier);
  assert.match(m.fixtureSeed ?? "", /^[a-z0-9-]{16,64}$/);
  for (const key of ["organizationId", "locationId", "membershipId", "slotId"])
    assert.match(m.scope?.[key] ?? "", /^[a-f0-9-]{36}$/);
  const raw = process.env.ISSUE300_W8_FIXTURE_DB_URL;
  assertOwnedUri(raw, m, "fixtureDb");
  assert.equal(process.env.ISSUE300_W8_FIXTURE_ACK, "SYNTHETIC_ONLY");
  const db = new Client({ connectionString: raw,
    application_name: "issue300_w8_owned_synthetic_seeder",
    statement_timeout: 90_000 });
  await db.connect();
  try {
    const identity = (await db.query(
      "SELECT current_database() AS db,current_user AS role",
    )).rows[0];
    assert.equal(identity.db, m.resource.database);
    assert.equal(identity.role, m.resource.fixtureRole);
    const old = Number(process.env.ISSUE300_W8_PREVIOUS_TIER || 0);
    assert([0, 100_000].includes(old) && old < plan.tier);
    const previous = old ? fixturePlan(old) : null;
    const base = [null, m.scope.organizationId,m.scope.locationId,
      m.scope.membershipId,m.fixtureSeed,plan.sessions,null,null,m.scope.slotId];
    // Exactly one committed task-owned cohort; no DELETE of any shared data.
    for (let start = (previous?.sessions ?? 0) + 1;
      start <= plan.sessions; start += limit) {
      const stop = Math.min(plan.sessions, start + limit - 1);
      await db.query("BEGIN");
      try {
        await db.query(`INSERT INTO vehicles
          (id,organization_id,temporary_descriptor,updated_at)
          SELECT md5($1::text || ':vehicle:' || i::text)::uuid,
            $2::uuid,'W8 SYNTHETIC',now()
          FROM generate_series($3::int,$4::int) AS i`,
        [m.fixtureSeed,m.scope.organizationId,start,stop]);
        await db.query(`INSERT INTO valet_sessions
          (id,organization_id,location_id,vehicle_id,state,
           checked_in_by_membership_id,customer_access_token_hash,
           customer_access_expires_at,updated_at)
          SELECT md5($1::text || ':session:' || i::text)::uuid,
            $2::uuid,$3::uuid,md5($1::text || ':vehicle:' || i::text)::uuid,
            'PARKED',$4::uuid,'W8-DISABLED-' || i::text,
            now() + interval '1 day',now()
          FROM generate_series($5::int,$6::int) AS i`,
        [m.fixtureSeed,m.scope.organizationId,m.scope.locationId,
          m.scope.membershipId,start,stop]);
        await db.query(`INSERT INTO tasks
          (id,organization_id,location_id,valet_session_id,task_type,
           status,updated_at)
          SELECT md5($1::text || ':task:' || i::text)::uuid,
          $2::uuid,$3::uuid,md5($1::text || ':session:' || i::text)::uuid,
          'PARKING','QUEUED',now()
          FROM generate_series($4::int,$5::int) AS i`,
        [m.fixtureSeed,m.scope.organizationId,m.scope.locationId,start,stop]);
        await db.query("COMMIT");
      } catch (e) { await db.query("ROLLBACK"); throw e; }
    }
    for (const kind of family) {
      for (let start = (previous?.perFamily ?? 0) + 1;
        start <= plan.perFamily; start += limit) {
        const values = [...base];
        values[0] = kind; values[6] = start;
        values[7] = Math.min(plan.perFamily,start + limit - 1);
        await db.query(fixtureStatement(kind), values);
      }
    }
    const sourceCounts = await verify(db,m,m.fixtureSeed,plan);
    const output = { candidateSha: m.candidateSha, leaseId: m.leaseId,
      database: m.resource.database, targetTier: plan.tier,
      sourceCounts, scopedPersistedSourceRecords: plan.tier,
      sessions: plan.sessions, provenance: "SYNTHETIC_SQL_ONLY",
      sourceFixtureHash: createHash("sha256").update(JSON.stringify({
        fixtureSeed: m.fixtureSeed, tier: plan.tier, sourceCounts,
      })).digest("hex") };
    assert(process.env.ISSUE300_W8_FIXTURE_OUTPUT);
    writeFileSync(process.env.ISSUE300_W8_FIXTURE_OUTPUT,
      JSON.stringify(output,null,2), {flag:"wx",mode:0o600});
    console.log(JSON.stringify({tier:plan.tier,provenance:output.provenance,
      counts:sourceCounts}));
  } finally { await db.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  run().catch((error) => { console.error(error.message);process.exitCode=1; });
