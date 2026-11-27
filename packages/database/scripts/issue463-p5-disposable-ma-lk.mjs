// Executable Issue #463 P5 MA/LK negative proof on one independently owned
// disposable PG17 with the actual migrated function/roles. NO production support.
import assert from "node:assert/strict";
import console from "node:console";
import { createHash } from "node:crypto";
import { assertP7SqlTarget } from "../../../apps/api/tools/issue463-browser-proof-sql-target.mjs";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";
import pg from "pg";
import { seedFeedbackReaderFixture } from "./issue463-p5-disposable-fixture.mjs";

const env=process.env;
const target=await assertP7SqlTarget(env);
const clients=[];
let assertions=0;
function equal(actual,expected,label) {
  assert.deepEqual(actual,expected,label);assertions++;
}
async function connect(name) {
  const c=new pg.Client({connectionString:env[name]});
  await c.connect();clients.push(c);
  await c.query("SET statement_timeout='8s'");
  return c;
}
const first=async(c,s,args=[]) => (await c.query(s,args)).rows[0];
async function denied(c,sql,args,expected,label) {
  let code="SUCCESS";
  try { await c.query(sql,args); } catch(e) { code=e.code; }
  equal(code,expected,label);
}
const readSql=`SELECT public.management_rating_feedback_projection(
  $1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::uuid,
  $6::uuid,$7::uuid,$8::date,$9::date) AS result`;
const numericSql=`SELECT public.management_rating_analytics_projection(
  $1::uuid,$2::uuid,$3::date,$4::date) AS result`;
const dbRead=async(r,args) => (await first(r,readSql,args)).result;
let migration,runtime,observer,writer,fixture;
try {
  migration=await connect("MIGRATION_DATABASE_URL");
  runtime=await connect("DATABASE_URL");
  observer=await connect("MIGRATION_DATABASE_URL");
  writer=await connect("MIGRATION_DATABASE_URL");
  const identity=await first(migration,`SELECT current_database() db,current_user role,
    current_setting('server_version_num')::integer version,
    system_identifier::text system FROM pg_control_system()`);
  equal(identity.db,target.database,"db attested");
  equal(identity.role,"issue463_p7_migrator","migration identity");
  equal(identity.system,target.system,"system ID attested");
  assert.equal(Math.floor(identity.version/10000),17);assertions++;
  equal((await first(runtime,"SELECT current_user role")).role,
    "issue463_p7_runtime","ordinary runtime");
  // Verify official migration provenance before seed or protected reads.
  const source=new URL("../prisma/migrations/20261127000200_issue463_management_feedback_reader_p5/migration.sql",import.meta.url);
  const hash=createHash("sha256").update(await readFile(source)).digest("hex");
  const actual=await first(migration,`SELECT checksum,finished_at IS NOT NULL finished
    FROM public._prisma_migrations WHERE migration_name=$1`,
    ["20261127000200_issue463_management_feedback_reader_p5"]);
  equal([actual?.checksum,actual?.finished],[hash,true],"P5 migration exact bytes");
  const gates=await first(migration,`SELECT
    has_function_privilege('issue463_p7_runtime',
      'public.management_rating_feedback_projection(uuid,uuid,text,timestamptz,uuid,uuid,uuid,date,date)',
      'EXECUTE') runtime_execute,
    has_function_privilege('vaylet_rating_feedback_reader_owner',
      'public.staff_auth_lock_current_session(uuid,uuid,text,timestamptz,text)',
      'EXECUTE') nested_execute,
    has_column_privilege('vaylet_rating_feedback_reader_owner',
      'public.guest_rating_comments','comment_text','SELECT') f_text,
    has_table_privilege('issue463_p7_runtime','public.guest_rating_comments','SELECT') runtime_raw,
    (SELECT count(*)::integer FROM pg_proc
      WHERE proowner='vaylet_rating_feedback_reader_owner'::regrole) f_functions`);
  equal(gates,{runtime_execute:true,nested_execute:true,f_text:true,
    runtime_raw:false,f_functions:2},"exact staged F / R role");
  equal((await first(runtime,"SELECT public.rating_feedback_is_protected() ready")).ready,
    true,"PROTECTED phase");
  fixture=await seedFeedbackReaderFixture(migration);
  const {ids,ca,lm,expiredLm,period}=fixture;
  await denied(runtime,"SELECT comment_text FROM public.guest_rating_comments",[],
    "42501","runtime raw comment denied");
  const company=await dbRead(runtime,ca);
  const location=await dbRead(runtime,lm);
  equal([company.eligibleCompletedVisits,company.ratedVisits,company.averageRating,
    company.participationRate,company.recentRatings.length],
    [6,5,"3.0000","0.833333",4],"company cohort and latest four");
  equal([location.eligibleCompletedVisits,location.ratedVisits,location.averageRating,
    location.participationRate,location.recentRatings.length],
    [5,4,"3.2500","0.800000",4],"LM active-location cohort");
  for(const [expanded,scope] of [[company,null],[location,ids.active]]) {
    const numeric=(await first(runtime,numericSql,[ids.org,scope,period,period])).result;
    const stripped={...expanded,
      recentRatings:expanded.recentRatings.map(row=>{
        const result={...row};
        delete result.comment;
        return result;
      })};
    equal(stripped,numeric,"numeric payload parity");
    assert.ok(expanded.recentRatings.every(r => Object.hasOwn(r,"comment")));
    assertions++;
    for (const row of expanded.recentRatings) {
      equal(Object.keys(row).sort().join(","),
        "authorizedLocationLabel,comment,completedAt,locationTimezone,ratedAt,rating,visitReference",
        "strict public latest row");
    }
  }
  const companyText=JSON.stringify(company);
  assert.ok(companyText.includes("P5_VISIBLE_A"));
  assert.ok(!companyText.includes("P5_HELD_SECRET"));
  assert.ok(!companyText.includes("P5_EXPIRED_SECRET"));
  for(const id of ids.visits) assert.ok(!companyText.includes(id));
  assertions+=3+ids.visits.length;
  equal(company.recentRatings.map(x=>x.comment),
    ["P5_VISIBLE_A",null,null,null],"erased/expired/held suppressed");
  const bad=[...ca];bad[2]="vsa1."+"Z".repeat(43);
  await denied(runtime,readSql,bad,"42501","wrong current bearer");
  const foreign=[...ca];foreign[5]=ids.foreignOrg;
  await denied(runtime,readSql,foreign,"42501","foreign org denied");
  const foreignLocation=[...lm];foreignLocation[6]=ids.foreignLoc;
  await denied(runtime,readSql,foreignLocation,"42501","foreign location denied");
  const lmCompany=[...lm];lmCompany[6]=null;
  await denied(runtime,readSql,lmCompany,"42501","LM company denied");
  await denied(runtime,readSql,expiredLm,"42501","expired current bearer");
  await runtime.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  try {
    await denied(runtime,readSql,lm,"42501","non-READ-COMMITTED denied");
  } finally {await runtime.query("ROLLBACK");}
  // Committed authority revocation must deny after fresh lock/read.
  await migration.query("UPDATE public.organization_memberships SET status='INACTIVE' WHERE id=$1",
    [ids.lmMember]);
  await denied(runtime,readSql,lm,"42501","committed member revocation");
  await migration.query("UPDATE public.organization_memberships SET status='ACTIVE' WHERE id=$1",
    [ids.lmMember]);
  // All six independently mutable authorization tuples must deny under
  // writer-first concurrency. Neither role hint nor app preflight can skip one.
  for (const [label,sql,values,actor] of [
    ["membership", "UPDATE public.organization_memberships SET status='INACTIVE' WHERE id=$1",
      [ids.lmMember],lm],
    ["organization", "UPDATE public.organizations SET status='INACTIVE' WHERE id=$1",
      [ids.org],lm],
    ["subscription", "UPDATE public.organization_subscriptions SET dashboard_access_enabled=false WHERE organization_id=$1",
      [ids.org],lm],
    ["location", "UPDATE public.locations SET status='INACTIVE' WHERE id=$1",
      [ids.active],lm],
    ["LM grant", "DELETE FROM public.membership_location_access WHERE membership_id=$1 AND location_id=$2",
      [ids.lmMember,ids.active],lm],
    ["CA MFA", "UPDATE public.user_mfa_totp_factors SET state='RETIRED', retired_at=clock_timestamp() WHERE id=$1",
      [ids.factor],ca],
  ]) {
    await writer.query("BEGIN");
    try {
      await writer.query(sql,values);
      await denied(runtime,readSql,actor,"55P03",label+" revoker-first NOWAIT");
    } finally {await writer.query("ROLLBACK");}
  }
  await writer.query("BEGIN");
  try {
    await writer.query("SELECT valet_session_id FROM public.guest_rating_comments WHERE valet_session_id=$1 FOR UPDATE",
      [ids.visits[0]]);
    await denied(runtime,readSql,lm,"55P03","in-flight child disposition NOWAIT");
  } finally {await writer.query("ROLLBACK");}
  // Reader-first: privileged row UPDATE must wait until read transaction commits.
  await runtime.query("BEGIN");
  const readerPid=(await first(runtime,"SELECT pg_backend_pid() pid")).pid;
  try {
    await dbRead(runtime,lm);
    await writer.query("BEGIN");
    const writerPid=(await first(writer,"SELECT pg_backend_pid() pid")).pid;
    const pending=writer.query(`UPDATE public.organization_memberships
      SET status='INACTIVE' WHERE id=$1`,[ids.lmMember]);
    void pending.catch(()=>undefined);
    let blocking=[];
    for(let i=0;i<20;i++) {
      blocking=(await first(observer,
        "SELECT pg_blocking_pids($1) blockers",[writerPid])).blockers;
      if(blocking.includes(readerPid)) break;
      await delay(40);
    }
    assert.ok(blocking.includes(readerPid),"reader-first writer must block");
    assertions++;
    await runtime.query("COMMIT");
    await pending;
    await writer.query("ROLLBACK");
  } finally {
    await runtime.query("ROLLBACK").catch(()=>undefined);
    await writer.query("ROLLBACK").catch(()=>undefined);
  }
  // Deadlock/timeout failure must leave the reusable transaction rolled back.
  await writer.query("BEGIN");
  try {
    await writer.query(`SELECT pg_advisory_xact_lock(
      hashtextextended('staff-management-org:'||$1::text,0))`,[ids.org]);
    await runtime.query("BEGIN");
    await runtime.query("SET LOCAL lock_timeout='120ms'");
    await denied(runtime,readSql,lm,"55P03","bounded advisory contention");
    await runtime.query("ROLLBACK");
  } finally {await writer.query("ROLLBACK");}
  equal((await dbRead(runtime,lm)).ratedVisits,4,"fresh retry after rollback");
  // Terminal revocations come last: production SQL deliberately forbids undoing
  // a revoked Staff session or reactivating a retired MFA factor.
  await migration.query("UPDATE public.user_mfa_totp_factors SET state='RETIRED', retired_at=clock_timestamp() WHERE id=$1",
    [ids.factor]);
  await denied(runtime,readSql,ca,"42501","committed inactive MFA factor");
  await migration.query("UPDATE public.staff_auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1",
    [ids.lmSession]);
  await denied(runtime,readSql,lm,"42501","committed revoked bearer");
  console.log(JSON.stringify({result:"PASS",assertions,
    scope:"Issue463 P5 real migrated PG17 CA/LM MA/LK, raw bearer, foreign/expiry/privacy/locks and numeric parity",
    migrationSha256:hash}));
} catch(error) {
  console.error(JSON.stringify({result:"FAIL",assertions,
    errorCode:error?.code??"ASSERT",message:error?.message??"unknown"}));
  process.exitCode=1;
} finally {
  for(const c of clients) {
    await c.query("ROLLBACK").catch(()=>undefined);
    await c.end().catch(()=>undefined);
  }
}
