// Full JSON SQL execution plans under the actual ordinary runtime role.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { readTarget, assertOwnedUri } from "./issue300-w8-target.mjs";
import { u004Endpoints, verifiedSourceOracle } from
  "./issue300-w8-http-evidence.mjs";
import { verifySyntheticSources } from "./issue300-w8-oracle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root,"apps/api/package.json"));
const ts = require("typescript");
const { Client } = require("pg");
const src = join(root,"apps/api/src/modules/management/audit-investigation");
const digest = (item) => createHash("sha256").update(item).digest("hex");
function load(file,imports={}) {
  const bytes=readFileSync(join(src,file),"utf8");
  const js=ts.transpileModule(bytes,{compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
  }}).outputText;
  const obj={exports:{},require(key){
    assert(key in imports,`Unreviewed SQL source import: ${key}`);
    return imports[key];
  }};
  vm.runInNewContext(js,obj,{timeout:1000,filename:file});
  return obj.exports;
}

export async function canonicalSql(scope, snapshot, m) {
  assert.match(snapshot.database ?? "", /^\d+:\d+:(?:[\d,]*)$/);
  assert.match(snapshot.cutoff ?? "",
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
  const witness=load("search/search-witness-sql.ts");
  const search=load("search/search-page-query.ts",{
    "./search-witness-sql":witness,
    "./search-integrity":{},
    "../../management-audit-event-catalog":{
      managementAuditKnownEventTypes:m.planProbe.knownAuditTypes,
    },
  });
  const statements=[];
  const stub={query:async(sql,params)=>{
    statements.push({sql,params});return{rows:[]};
  }};
  for(const name of ["search","busySlotSearch"]){
    await search.queryAuditInvestigationFirstPage(stub,scope,{
      from:m.planProbe.from,to:m.planProbe.to,limit:100,
      keySlotId:name==="busySlotSearch"?m.scope.slotId:undefined,
      // Explicitly no Session anchor on either performance Search workload.
    },{makePrefix:null,modelPrefix:null,plate:null,plateCountry:null},
    {now:snapshot.now,cutoff:snapshot.cutoff,
      database:snapshot.database},undefined);
  }
  const timeline=load("timeline/timeline-source-query.ts");
  await timeline.readTimelineSources(stub,scope,
    m.planProbe.sessionId,101,undefined,{
      cutoff:snapshot.cutoff,database:snapshot.database,
    });
  await timeline.readTimelineSources(stub,scope,
    m.planProbe.sessionId,2,{
      source:m.planProbe.detailSource,id:m.planProbe.detailId,
    },{cutoff:snapshot.cutoff,database:snapshot.database});
  assert.equal(statements.length,u004Endpoints.length);
  for(const statement of statements.slice(0,2)){
    assert.equal(statement.params[8],snapshot.cutoff);
    assert.equal(statement.params[9],snapshot.database);
    assert.equal(statement.params[13],null,
      "Search plans must NOT use sessionId predicate");
  }
  assert.equal(statements[0].params[4],null);
  assert.equal(statements[1].params[4],m.scope.slotId);
  for (const statement of statements.slice(2)) {
    assert.equal(statement.params[6],snapshot.database);
    assert.equal(statement.params[7],snapshot.cutoff);
  }
  return statements;
}

export function assertNonemptyPlan(plan, rows, endpoint, expected) {
  assert(Number.isFinite(plan?.Plan?.["Actual Rows"]) &&
    plan.Plan["Actual Rows"] > 0,
    `False-fast ${endpoint} EXPLAIN: empty root rows`);
  assert(Array.isArray(rows) && rows.length>0,
    `No measured ${endpoint} SQL evidence rows`);
  if (endpoint==="search" || endpoint==="busySlotSearch") {
    const key=expected[endpoint];
    assert(rows.some((r)=>r.sessionId===key.sessionId &&
      Number(r.matchingRecordCount)>0 && Array.isArray(r.reasons) &&
      r.reasons.some((reason)=>reason.source===key.source &&
        reason.eventId===key.eventId &&
        (endpoint!=="busySlotSearch" || reason.matchedBy==="KEY_SLOT"))),
    `${endpoint} SQL missing independently signed source-qualified witness`);
  }
  else {
    const key=endpoint==="timeline"?expected.timeline:expected.detail;
    assert(rows.some((r)=>r.source===key.source && r.id===key.eventId),
      `${endpoint} SQL missing independently signed source ID`);
  }
  return true;
}

async function run() {
  const m=readTarget();
  const oracle=verifiedSourceOracle(m);
  assert.equal(m.planProbe.from,oracle.workloadWindow.from);
  assert.equal(m.planProbe.to,oracle.workloadWindow.to);
  assert.equal(m.planProbe.sessionId,oracle.expected.timeline.sessionId);
  assert.equal(m.planProbe.detailSource,oracle.expected.detail.source);
  assert.equal(m.planProbe.detailId,oracle.expected.detail.eventId);
  assertOwnedUri(process.env.ISSUE300_W8_RUNTIME_DB_URL,m,"db");
  const counted=await verifySyntheticSources(m,
    process.env.ISSUE300_W8_RUNTIME_DB_URL);
  assert(counted.scopedPersistedSourceRecords>=m.targetTier);
  assert.deepEqual(counted.slotSkew,oracle.skew.busySlot);
  assert.match(m.planProbe?.sessionId ?? "",
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  assert.match(m.planProbe?.detailId ?? "",
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  assert(["AUDIT","KEY_CUSTODY","DISPATCH","INCIDENT"].includes(
    m.planProbe?.detailSource));
  assert(Array.isArray(m.planProbe.knownAuditTypes) &&
    m.planProbe.knownAuditTypes.includes("VALET_SESSION_PARKED"));
  const scope={organizationId:m.scope.organizationId,
    locationId:m.scope.locationId};
  const db=new Client({connectionString:process.env.ISSUE300_W8_RUNTIME_DB_URL,
    application_name:"issue300_w8_json_explain",statement_timeout:120_000});
  await db.connect();
  try {
    await db.query("BEGIN READ ONLY");
    const scopeCheck=(await db.query(`WITH capture AS MATERIALIZED (
      SELECT clock_timestamp() AS stamp,pg_current_snapshot()::text AS snap)
      SELECT current_user AS role,current_database() AS db,
        capture.stamp AS now,
        to_char(capture.stamp AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cutoff,
        capture.snap AS database FROM capture`)).rows[0];
    assert.equal(scopeCheck.role,m.resource.runtimeRole);
    assert.equal(scopeCheck.db,m.resource.database);
    const statements=await canonicalSql(scope,scopeCheck,m);
    const plans=[];
    for(let i=0;i<statements.length;i++){
      const {sql,params}=statements[i];
      const response=await db.query(
        "EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON) "+sql,params);
      const fullExplainJson=response.rows[0]?.["QUERY PLAN"];
      assert(Array.isArray(fullExplainJson) && fullExplainJson.length===1);
      const plan=fullExplainJson[0];
      const rows=(await db.query(sql,params)).rows;
      assertNonemptyPlan(plan,rows,u004Endpoints[i],
        oracle.expected);
      plans.push({endpoint:u004Endpoints[i],
        candidateSha:m.candidateSha,containerId:m.resource.containerId,
        expectedSourceId:oracle.expected[u004Endpoints[i]].eventId,
        expectedSessionId:oracle.expected[u004Endpoints[i]].sessionId,
        scopedHighSkewCount: counted.slotSkew.persistedCustodyRows,
        role:scopeCheck.role,sqlSha256:digest(sql),
        planSha256:digest(JSON.stringify(plan)),
        fullExplainJson, buffers:{sharedHit:plan.Plan?.["Shared Hit Blocks"],
          sharedRead:plan.Plan?.["Shared Read Blocks"],
          tempRead:plan.Plan?.["Temp Read Blocks"],
          tempWritten:plan.Plan?.["Temp Written Blocks"]}});
    }
    assert(process.env.ISSUE300_W7_EXPLAIN_PLANS);
    const report={candidateSha:m.candidateSha,leaseId:m.leaseId,
      database:m.resource.database,containerId:m.resource.containerId,
      apiBundleSha256:m.resource.apiBundleSha256,
      targetTier:m.targetTier,plans,
      limitation:"Detail plan covers canonical timeline source lookup; HTTP E2E independently measured"};
    writeFileSync(process.env.ISSUE300_W7_EXPLAIN_PLANS,
      JSON.stringify(report,null,2),{flag:"wx",mode:0o600});
    await db.query("ROLLBACK");
    console.log(JSON.stringify({verdict:"FOUR_JSON_SQL_PLANS_RECORDED",
      endpoints:plans.map((p)=>p.endpoint)}));
  } catch(e) {await db.query("ROLLBACK").catch(()=>{});throw e;}
  finally {await db.end();}
}

if (process.argv[1]?.endsWith("issue300-w8-plans.mjs"))
  run().catch((e)=>{console.error("W8 plan blocked:",e.message);process.exitCode=1;});
