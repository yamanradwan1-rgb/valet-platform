// Issue #463 P7 / LK04 PR05 LK07: real dual readers and A/E HOLD/ERASE races.
// Called only by the already-attested P7 runner *after official W1 P5_TEST*.
// Does not create roles, grant privileges, copy migrations or access other DBs.
import assert from "node:assert/strict";
import console from "node:console";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { assertP7SqlTarget } from "../../../apps/api/tools/issue463-browser-proof-sql-target.mjs";
import { seedFeedbackReaderFixture } from "./issue463-p5-disposable-fixture.mjs";

const env=process.env;
const target=await assertP7SqlTarget(env);
let assertions=0;
const clients=[];
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);assertions++;};
async function connect(key) {
  const client=new pg.Client({connectionString:env[key],connectionTimeoutMillis:5000});
  await client.connect();
  clients.push(client);
  await client.query("SET statement_timeout='8000ms'");
  return client;
}
const one=async(c,sql,args=[]) => (await c.query(sql,args)).rows[0];
const readerSql=`SELECT public.management_rating_feedback_projection(
  $1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::uuid,
  $6::uuid,$7::uuid,$8::date,$9::date) AS value`;
const oldSql=`SELECT public.management_rating_analytics_projection(
  $1::uuid,$2::uuid,$3::date,$4::date) AS value`;
const read=async(c,p)=>(await one(c,readerSql,p)).value;
async function denied(c,sql,args,expected,label) {
  let code="SUCCESS";
  try {await c.query(sql,args);} catch(error){code=error.code;}
  eq(code,expected,label);
}
function visitRef(uuid) {
  return "VISIT-"+createHash("sha256").update(uuid).digest("hex").slice(0,12).toUpperCase();
}
async function awaitBlocked(observer,pid,readerPids,label) {
  let blocked=[];
  for(let n=0;n<35;n++) {
    blocked=(await one(observer,
      "SELECT pg_blocking_pids($1) AS ids",[pid])).ids;
    if(readerPids.every(id=>blocked.includes(id))) break;
    await delay(60);
  }
  for(const id of readerPids) assert.ok(blocked.includes(id),label);
  assertions++;
}
async function awaitAnyBlocked(observer,pid,readerPids,label) {
  let blocked=[];
  for(let n=0;n<35;n++) {
    blocked=(await one(observer,
      "SELECT pg_blocking_pids($1) AS ids",[pid])).ids;
    if(blocked.some(id=>readerPids.includes(id))) break;
    await delay(60);
  }
  assert.ok(blocked.some(id=>readerPids.includes(id)),label);assertions++;
}
async function seedPresent(m,ids,period,count,tiedAt=null) {
  const visits=[];
  for(let i=0;i<count;i++) {
    const id=randomUUID(),vehicle=randomUUID();
    const content="P7_APPROVED_"+i;
    await m.query(`INSERT INTO public.vehicles
      (id,organization_id,temporary_descriptor,updated_at)
      VALUES($1,$2,'P7 synthetic',clock_timestamp())`,[vehicle,ids.org]);
    await m.query(`INSERT INTO public.valet_sessions
      (id,organization_id,location_id,vehicle_id,state,checked_in_by_membership_id,
       customer_access_token_hash,customer_access_expires_at,completed_at,updated_at)
      VALUES($1,$2,$3,$4,'COMPLETED',$5,
       public.guest_browser_hash_secret($6),clock_timestamp()+interval '1 hour',
       $7,clock_timestamp())`,
      [id,ids.org,ids.active,vehicle,ids.lmMember,
       randomBytes(32).toString("base64url"),period+"T12:00:00Z"]);
    const ratedAt=tiedAt??new Date(Date.now()-(count-i)*1000).toISOString();
    await m.query(`INSERT INTO public.guest_ratings
      (organization_id,location_id,valet_session_id,rating,rated_at)
      VALUES($1,$2,$3,5,$4)`,[ids.org,ids.active,id,ratedAt]);
    await m.query(`INSERT INTO public.guest_rating_comments
      (organization_id,location_id,valet_session_id,comment_text,state,
       retention_expires_at,notice_version)
      VALUES($1,$2,$3,$4,'PRESENT',clock_timestamp()+interval '1 day',1)`,
      [ids.org,ids.active,id,content]);
    visits.push({id,ref:visitRef(id),content});
  }
  return visits;
}
function comment(projection,visit) {
  const item=projection.recentRatings.find(row=>row.visitReference===visit.ref);
  assert.ok(item,"expected visit must remain in latest4");assertions++;
  return item.comment;
}
async function testPrivacy({
  runtime,executor,approver,observer,migration,fixture,
  approvalAction,order,visit,
}) {
  const {ids,lm}=fixture;
  const approval=randomUUID(),caseId=randomUUID();
  eq((await one(approver,`SELECT public.approve_guest_rating_comment_disposition(
    $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::text,$6::uuid,$7::timestamptz) AS result`,
    [approval,ids.org,ids.active,visit.id,approvalAction,caseId,
      new Date(Date.now()+3600000)])).result,"APPROVED",
    order+" "+approvalAction+" actual A approval");
  const applySql=`SELECT public.apply_guest_rating_comment_disposition($1::uuid) AS result`;
  const expected=approvalAction==="HOLD"?"HELD":"ERASED";
  if(order==="reader-first") {
    await runtime.query("BEGIN");
    await executor.query("BEGIN");
    let pending;
    try {
      const before=await read(runtime,lm);
      eq(comment(before,visit),visit.content,
        "reader sees PRESENT before "+approvalAction);
      const readerPid=(await one(runtime,"SELECT pg_backend_pid() pid")).pid;
      const execPid=(await one(executor,"SELECT pg_backend_pid() pid")).pid;
      pending=one(executor,applySql,[approval]);
      void pending.catch(()=>undefined);
      await awaitBlocked(observer,execPid,[readerPid],
        "E "+approvalAction+" must wait for protected child SHARE");
      await runtime.query("COMMIT");
      eq((await pending).result,expected,"E "+approvalAction+" after reader commits");
      await executor.query("COMMIT");
    } finally {
      await runtime.query("ROLLBACK").catch(()=>undefined);
      await executor.query("ROLLBACK").catch(()=>undefined);
    }
  } else {
    await executor.query("BEGIN");
    try {
      eq((await one(executor,applySql,[approval])).result,expected,
        "E "+approvalAction+" BEFORE reader");
      await runtime.query("BEGIN");
      try {
        await denied(runtime,readerSql,lm,"55P03",
          "reader NOWAIT under actual E "+approvalAction+" transaction");
      } finally {await runtime.query("ROLLBACK");}
      await executor.query("COMMIT");
    } finally {await executor.query("ROLLBACK").catch(()=>undefined);}
  }
  const after=await read(runtime,lm);
  eq(comment(after,visit),null,
    "privacy "+approvalAction+" suppresses text after commit");
  const state=await one(migration,`SELECT state,comment_text
    FROM public.guest_rating_comments WHERE valet_session_id=$1`,[visit.id]);
  eq(state.state,expected==="HELD"?"HELD":"ERASED",
    "actual A/E state transition");
  if(approvalAction==="ERASE") eq(state.comment_text,null,
    "actual A/E erasure clears text");
  eq((await one(migration,`SELECT rating FROM public.guest_ratings
    WHERE valet_session_id=$1`,[visit.id])).rating,5,
    "A/E privacy leaves numeric parent untouched");
}
async function testTwoReaders({oneReader,secondReader,writer,observer,fixture}) {
  const lm=fixture.lm, member=fixture.ids.lmMember;
  await oneReader.query("BEGIN");
  await secondReader.query("BEGIN");
  await writer.query("BEGIN");
  try {
    eq((await read(oneReader,lm)).ratedVisits,10,
      "reader1 shared authorized, no first-reader exclusion");
    eq((await read(secondReader,lm)).ratedVisits,10,
      "reader2 shared authorized, no second-reader exclusion");
    const a=(await one(oneReader,"SELECT pg_backend_pid() pid")).pid;
    const b=(await one(secondReader,"SELECT pg_backend_pid() pid")).pid;
    assert.notEqual(a,b);assertions++;
    const w=(await one(writer,"SELECT pg_backend_pid() pid")).pid;
    const promote=writer.query(`UPDATE public.organization_memberships
      SET role='ORG_ADMIN' WHERE id=$1`,[member]);
    void promote.catch(()=>undefined);
    await awaitAnyBlocked(observer,w,[a,b],
      "LM to ORG_ADMIN must be blocked while two readers hold SHARE");
    await oneReader.query("COMMIT");
    await awaitBlocked(observer,w,[b],
      "role promotion must still wait for remaining reader");
    await secondReader.query("COMMIT");
    eq((await promote).rowCount,1,
      "role promotion completes only after both readers");
    await writer.query("COMMIT");
  } finally {
    await oneReader.query("ROLLBACK").catch(()=>undefined);
    await secondReader.query("ROLLBACK").catch(()=>undefined);
    await writer.query("ROLLBACK").catch(()=>undefined);
  }
  await denied(oneReader,readerSql,lm,"42501",
    "promoted LM cannot read without current CA MFA");
  eq((await one(writer,`SELECT role FROM public.organization_memberships
    WHERE id=$1`,[member])).role,"ORG_ADMIN",
    "committed role promotion not bypassed");
}
let m,r1,r2,a,e,observer,writer;
try {
  m=await connect("MIGRATION_DATABASE_URL");
  r1=await connect("DATABASE_URL");
  r2=await connect("DATABASE_URL");
  a=await connect("RATING_FEEDBACK_APPROVER_DATABASE_URL");
  e=await connect("RATING_FEEDBACK_EXECUTOR_DATABASE_URL");
  observer=await connect("MIGRATION_DATABASE_URL");
  writer=await connect("MIGRATION_DATABASE_URL");
  const found=await one(m,`SELECT current_database() db,current_user role,
    system_identifier::text sid FROM pg_control_system()`);
  eq([found.db,found.role,found.sid],
    [target.database,"issue463_p7_migrator",target.system],
    "exact same attested P7 DB with migrator principal");
  for(const [client,role] of [
    [r1,"issue463_p7_runtime"],[r2,"issue463_p7_runtime"],
    [a,"vaylet_rating_feedback_privacy_approver"],
    [e,"vaylet_rating_feedback_privacy_executor"],
  ]) eq((await one(client,"SELECT session_user login")).login,role,
    "exact real A/E/R session identity");
  eq((await one(r1,"SELECT public.rating_feedback_is_protected() ready")).ready,
    true,"official W1 P5_TEST protected phase");
  const fixture=await seedFeedbackReaderFixture(m);
  const visits=await seedPresent(m,fixture.ids,fixture.period,4);
  const baseline=await read(r1,fixture.lm);
  eq(baseline.recentRatings.map(x=>x.visitReference),
    [...visits].reverse().map(x=>x.ref),"deterministic P7 latest4 ordering");
  const numeric=(await one(r1,oldSql,
    [fixture.ids.org,fixture.ids.active,fixture.period,fixture.period])).value;
  eq(baseline.ratedVisits,numeric.ratedVisits,"numeric before A/E");
  const emptyDay=new Date(fixture.period+"T00:00:00Z");
  emptyDay.setUTCDate(emptyDay.getUTCDate()-10);
  const empty=emptyDay.toISOString().slice(0,10);
  const emptyParams=[...fixture.lm.slice(0,7),empty,empty];
  const expandedEmpty=await read(r1,emptyParams);
  const legacyEmpty=(await one(r1,oldSql,[fixture.ids.org,fixture.ids.active,
    empty,empty])).value;
  const publicEmpty={...expandedEmpty,recentRatings:expandedEmpty.recentRatings.map(
    item=>{const row={...item};delete row.comment;return row;})};
  eq(publicEmpty,legacyEmpty,"zero-cohort full numeric parity");
  eq([expandedEmpty.eligibleCompletedVisits,expandedEmpty.ratedVisits,
    expandedEmpty.recentRatings.length],[0,0,0],"zero-cohort exact emptiness");
  // Test all four interleavings against real A and E actors.
  for(const [i,action,order] of [
    [0,"HOLD","reader-first"],[1,"HOLD","executor-first"],
    [2,"ERASE","reader-first"],[3,"ERASE","executor-first"],
  ]) await testPrivacy({runtime:r1,executor:e,approver:a,observer,
    migration:m,fixture,approvalAction:action,order,visit:visits[i]});
  const after=await read(r1,fixture.lm);
  eq(after.ratedVisits,numeric.ratedVisits,"A/E all orders preserve numeric");
  eq(after.recentRatings.map(x=>x.comment),[null,null,null,null],
    "HOLD+ERASE both orders do not leak text");
  const tied=await seedPresent(m,fixture.ids,fixture.period,2,
    new Date(Date.now()-150).toISOString());
  const afterTie=await read(r1,fixture.lm);
  eq(afterTie.recentRatings.slice(0,2).map(row=>row.visitReference),
    [...tied].sort((a,b)=>a.id<b.id?1:-1).map(row=>row.ref),
    "exact UUID DESC tie-break on same ratedAt and completedAt");
  const numericTie=(await one(r1,oldSql,[fixture.ids.org,fixture.ids.active,
    fixture.period,fixture.period])).value;
  eq(afterTie.ratedVisits,numericTie.ratedVisits,
    "numeric cohort after tie remains aligned");
  await testTwoReaders({oneReader:r1,secondReader:r2,writer,observer,fixture});
  console.log(JSON.stringify({result:"PASS",assertions,
    scope:"P7 LK04 dual reader role promotion + PR05/LK07 A/E HOLD/ERASE both orders"}));
} catch(error) {
  console.error(JSON.stringify({result:"FAIL",assertions,
    code:error?.code??"ASSERT",reason:"P7_ROLE_PRIVACY_RACE"}));
  process.exitCode=1;
} finally {
  for(const c of clients) {
    await c.query("ROLLBACK").catch(()=>undefined);
    await c.end().catch(()=>undefined);
  }
}
