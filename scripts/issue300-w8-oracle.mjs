// Independent READ ONLY count; never trust declared fixture JSON alone.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTarget, assertOwnedUri } from "./issue300-w8-target.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const { Client }=createRequire(resolve(root,"apps/api/package.json"))("pg");
const tables={
  AUDIT:"audit_events",KEY_CUSTODY:"key_custody_events",
  DISPATCH:"dispatch_events",INCIDENT:"incidents",
};

export async function verifySyntheticSources(m,raw) {
  assertOwnedUri(raw,m,"db");
  assert([100_000,1_000_000].includes(m.targetTier));
  assert.match(m.fixtureSeed ?? "",/^[a-z0-9-]{16,64}$/);
  const db=new Client({connectionString:raw,
    application_name:"issue300_w8_actual_readonly_count",
    statement_timeout:120_000});
  await db.connect();
  try {
    await db.query("BEGIN READ ONLY");
    const role=(await db.query("SELECT current_user AS role,current_database() AS db"))
      .rows[0];
    assert.equal(role.role,m.resource.runtimeRole);
    assert.equal(role.db,m.resource.database);
    const sourceCounts={};
    for(const [source,table] of Object.entries(tables)) {
      const r=await db.query(`SELECT count(*)::int AS total,
        count(DISTINCT t.valet_session_id)::int AS sessions
        FROM generate_series(1,$1::int) i
        JOIN ${table} t
          ON t.id=md5($2::text || ':' || $3::text ||
            ':' || i::text)::uuid
        WHERE t.organization_id=$4::uuid AND t.location_id=$5::uuid
          AND t.pagination_birth_xid IS NOT NULL`,[
        m.targetTier/4,m.fixtureSeed,source,
        m.scope.organizationId,m.scope.locationId,
      ]);
      assert.equal(r.rows[0].total,m.targetTier/4,
        `Missing deterministic persisted ${source} source rows`);
      assert(r.rows[0].sessions>0);
      sourceCounts[source]=r.rows[0].total;
    }
    const sessions=(await db.query(`SELECT count(*)::int AS n FROM
      generate_series(1,$1::int) i
      JOIN valet_sessions s ON s.id=md5($2::text ||
        ':session:' || i::text)::uuid
      WHERE s.organization_id=$3::uuid AND s.location_id=$4::uuid
        AND s.pagination_birth_xid IS NOT NULL`,[
      m.targetTier/100,m.fixtureSeed,m.scope.organizationId,
      m.scope.locationId,
    ])).rows[0]?.n;
    assert.equal(sessions,m.targetTier/100);
    await db.query("ROLLBACK");
    return {sourceCounts,sessions,scopedPersistedSourceRecords:
      Object.values(sourceCounts).reduce((a,b)=>a+b,0)};
  } catch(error) {
    await db.query("ROLLBACK").catch(()=>{});
    throw error;
  } finally {await db.end();}
}

if(process.argv[1]?.endsWith("issue300-w8-oracle.mjs")){
  (async()=>{
    const m=readTarget();
    const proof=await verifySyntheticSources(
      m,process.env.ISSUE300_W8_RUNTIME_DB_URL);
    console.log(JSON.stringify({verdict:"INDEPENDENT_SYNTHETIC_COUNT",
      tier:m.targetTier,counts:proof.sourceCounts,sessions:proof.sessions}));
  })().catch((e)=>{console.error("W8 oracle blocked:",e.message);
    process.exitCode=1;});
}
