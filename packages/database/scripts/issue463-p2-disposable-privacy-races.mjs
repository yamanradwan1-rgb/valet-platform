// P2 bounded expiry and privacy case/race diagnostics, disposable PG17 only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import pg from "pg";

for (const k of [
  "ISSUE463_P2_DISPOSABLE_ATTEST", "MIGRATION_DATABASE_URL",
  "ISSUE463_TEST_RUNTIME_DATABASE_URL", "ISSUE463_TEST_APPROVER_DATABASE_URL",
  "ISSUE463_TEST_EXECUTOR_DATABASE_URL",
]) if (!process.env[k]) throw Error("Disposable Issue463 test target required");
if (process.env.NODE_ENV !== "test") throw Error("P2 privacy races are test-only");
for (const [name,principal] of [
  ["MIGRATION_DATABASE_URL","p0463_migrator"],
  ["ISSUE463_TEST_RUNTIME_DATABASE_URL","p0463_runtime"],
  ["ISSUE463_TEST_APPROVER_DATABASE_URL","vaylet_rating_feedback_privacy_approver"],
  ["ISSUE463_TEST_EXECUTOR_DATABASE_URL","vaylet_rating_feedback_privacy_executor"],
]) {
  const url=new URL(process.env[name]);
  if(!["postgresql:","postgres:"].includes(url.protocol)||
     url.hostname!=="127.0.0.1"||url.pathname!=="/p0463_w2_db"||
     url.username!==principal||!/^\d{4,5}$/.test(url.port)){
    throw Error("P2 privacy races require exact loopback fixture principals");
  }
}
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const clients=[];
let assertions=0;
const eq=(a,b,name)=>{assert.deepEqual(a,b,name);assertions++;};
async function connect(name){
  const c=new pg.Client({connectionString:process.env[name]});
  await c.connect();clients.push(c);
  await c.query("SET statement_timeout = '10s'");
  return c;
}
const one=async(c,sql,p=[])=>(await c.query(sql,p)).rows[0];
let m,r,a,e,blocker;
try {
  m=await connect("MIGRATION_DATABASE_URL");
  r=await connect("ISSUE463_TEST_RUNTIME_DATABASE_URL");
  a=await connect("ISSUE463_TEST_APPROVER_DATABASE_URL");
  e=await connect("ISSUE463_TEST_EXECUTOR_DATABASE_URL");
  blocker=await connect("MIGRATION_DATABASE_URL");
  const guard=await one(m,"SELECT current_database() db,current_user usr,system_identifier::text system FROM pg_control_system()");
  eq([guard.db,guard.usr,guard.system],
    ["p0463_w2_db","p0463_migrator",process.env.ISSUE463_P2_DISPOSABLE_ATTEST],
    "own PG17 instance");
  const org=id(101), loc=id(201);
  const dueIds=[id(704),id(705)];
  for(const visit of dueIds){
    await m.query("INSERT INTO public.guest_ratings(organization_id,location_id,valet_session_id,rating,rated_at) VALUES($1,$2,$3,4,clock_timestamp()-interval '31 days')",
      [org,loc,visit]);
    await m.query("INSERT INTO public.guest_rating_comments(organization_id,location_id,valet_session_id,comment_text,state,retention_expires_at,notice_version) VALUES($1,$2,$3,'expired test content','PRESENT',clock_timestamp()-interval '1 day',1)",
      [org,loc,visit]);
  }
  // Reproduce the old predictable approval-ID preclaim; the new expiry path
  // generates a separate random system ID and enforces UNIQUE(visit) EXPIRE.
  const predictable=createHash("md5").update("issue463-expiry:"+dueIds[0]).digest("hex");
  const until=new Date(Date.now()+3600000);
  eq((await one(a,"SELECT public.approve_guest_rating_comment_disposition($1,$2,$3,$4,'HOLD',$5,$6) result",
    [predictable,org,loc,dueIds[0],id(850),until])).result,
    "APPROVED","human can preclaim legacy predictable ID harmlessly");
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM public.valet_sessions WHERE id=$1 FOR UPDATE",[dueIds[0]]);
  eq((await one(e,"SELECT public.expire_guest_rating_comments(1) n")).n,
    1,"busy first visit does not starve next due candidate");
  let rows=(await m.query("SELECT valet_session_id,state,comment_text IS NULL cleared FROM public.guest_rating_comments WHERE valet_session_id = ANY($1::uuid[]) ORDER BY valet_session_id",[dueIds])).rows;
  eq(rows.map(x=>[x.state,x.cleared]),[["PRESENT",false],["ERASED",true]],
    "busy candidate retained and second erased");
  await blocker.query("COMMIT");
  eq((await one(e,"SELECT public.expire_guest_rating_comments(1) n")).n,
    1,"released candidate eventually erased");
  eq((await one(e,"SELECT public.expire_guest_rating_comments(1) n")).n,
    0,"no duplicate expiry / idempotent rerun");
  rows=(await m.query("SELECT valet_session_id,state,comment_text IS NULL cleared FROM public.guest_rating_comments WHERE valet_session_id = ANY($1::uuid[]) ORDER BY valet_session_id",[dueIds])).rows;
  eq(rows.map(x=>[x.state,x.cleared]),[["ERASED",true],["ERASED",true]],
    "both physical SQL text values logically cleared");
  const receipts=await one(m,"SELECT count(*)::int n,count(DISTINCT visit_id)::int visits,count(*) FILTER(WHERE approval_id=$1)::int old_collision FROM public.guest_rating_comment_privacy_commands WHERE action='EXPIRE'",
    [predictable]);
  eq([receipts.n,receipts.visits,receipts.old_collision],
    [2,2,0],"unpredictable internal IDs plus unique visit expiry");
  const stars=await one(m,"SELECT count(*)::int n FROM guest_ratings WHERE valet_session_id = ANY($1::uuid[]) AND rating=4",[... [dueIds]]);
  eq(stars.n,2,"numeric parent preserved");
  const afterErasedHold=id(872), afterErasedRelease=id(873);
  for (const [action,approval] of [
    ["HOLD",afterErasedHold],["RELEASE",afterErasedRelease],
  ]) {
    eq((await one(a,
      "SELECT public.approve_guest_rating_comment_disposition($1,$2,$3,$4,$5,$6,$7) result",
      [approval,org,loc,dueIds[0],action,id(874),until])).result,
      "APPROVED","approval alone never creates actual held state");
    eq((await one(e,"SELECT public.apply_guest_rating_comment_disposition($1) result",
      [approval])).result,"DENIED",
      "already-erased comment does not grant HOLD/RELEASE success");
  }
  const guest=await one(r,"SELECT result_code FROM public.guest_rating_submit($1,4,'expired test content',$2)",
    ["D".repeat(43),dueIds[0]]);
  eq(guest.result_code,"CONFLICT","erased content cannot be resurrected");
  const notice=await one(a,"SELECT public.revoke_guest_rating_comment_notice($1,$2,1,$3) result",
    [org,loc,id(861)]);
  eq(notice.result,"REVOKED","versioned approval terminal revoke");
  const noNew=await one(r,"SELECT result_code FROM public.guest_rating_submit($1,5,'new comment',$2)",
    ["F".repeat(43),id(706)]);
  eq(noNew.result_code,"FEEDBACK_UNAVAILABLE","revoked notice blocks new collection");
  const record=await one(m,"SELECT count(*)::int n FROM public.guest_ratings WHERE valet_session_id=$1",[id(706)]);
  eq(record.n,0,"no stars-only downgrade on missing approval");
  const noRecordApproval=id(870);
  eq((await one(a,"SELECT public.approve_guest_rating_comment_disposition($1,$2,$3,$4,'ERASE',$5,$6) result",
    [noRecordApproval,org,loc,id(706),id(871),until])).result,
    "APPROVED","pre-submission rights case admitted but not falsely completed");
  eq((await one(e,"SELECT public.apply_guest_rating_comment_disposition($1) result",[noRecordApproval])).result,
    "NO_RECORD_WAIT","unclosed 24h submission window");
  const open=await one(m,"SELECT completed_at IS NULL open FROM public.guest_rating_comment_privacy_commands WHERE approval_id=$1",[noRecordApproval]);
  eq(open.open,true,"no premature terminal erasure receipt");
  const missingHold=id(876);
  eq((await one(a,
    "SELECT public.approve_guest_rating_comment_disposition($1,$2,$3,$4,'HOLD',$5,$6) result",
    [missingHold,org,loc,id(706),id(877),until])).result,
    "APPROVED","rights case authorization distinct from outcome");
  eq((await one(e,"SELECT public.apply_guest_rating_comment_disposition($1) result",
    [missingHold])).result,"DENIED",
    "missing child never fabricates successful HOLD");
  console.log(JSON.stringify({result:"PASS",assertions,
    scope:"expiry-ID collision, busy-row progress, rights notice revoke, no-record case"}));
} catch(error) {
  console.error(JSON.stringify({result:"FAIL",assertions,message:error.message,code:error.code}));
  process.exitCode=1;
} finally {
  if(blocker) await blocker.query("ROLLBACK").catch(()=>{});
  for(const c of clients) await c.end().catch(()=>{});
}
