// Controlled Issue463 P2 SQL smoke. Disposable PostgreSQL17 ONLY; no prod URL.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { assertP7SqlTarget } from "../../../apps/api/tools/issue463-browser-proof-sql-target.mjs";
import { seedP2Fixture } from "./issue463-p2-disposable-fixture.mjs";
const target=await assertP7SqlTarget();
const id = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12,"0");
const org=id(101), loc=id(201);
const clients = [];
let assertions=0, parity=0, incompatible=0;
function eq(actual,expected,name) {
  assert.deepEqual(actual,expected,name);
  assertions++;
}
async function db(url) {
  const client=new pg.Client({connectionString:process.env[url]});
  await client.connect();
  await client.query("SET statement_timeout='10s'");
  clients.push(client);
  return client;
}
async function row(client,sql,args=[]) {
  return (await client.query(sql,args)).rows[0];
}
async function denied(client,sql,args=[]) {
  let code;
  try {await client.query(sql,args);} catch(error) {code=error.code;}
  eq(code,"42501","denied as required");
}
let migration,runtime,approver,executor;
try {
  migration=await db("MIGRATION_DATABASE_URL");
  runtime=await db("DATABASE_URL");
  approver=await db("RATING_FEEDBACK_APPROVER_DATABASE_URL");
  executor=await db("RATING_FEEDBACK_EXECUTOR_DATABASE_URL");
  const where=await row(migration,"SELECT current_database() db,current_user principal,current_setting('server_version_num')::int pg,system_identifier::text sid FROM pg_control_system()");
  eq([where.db,where.principal,where.pg,where.sid],
     [target.database,"issue463_p7_migrator",170011,target.system],
     "fresh W2 attestation");
  const migrations=await row(migration,"SELECT count(*)::int n,count(*) FILTER(WHERE finished_at IS NOT NULL)::int ok FROM _prisma_migrations");
  eq([migrations.n,migrations.ok],[157,157],"complete official migration ledger");
  eq((await row(runtime,"SELECT public.rating_feedback_is_protected() p")).p,true,"protected");
  await denied(runtime,"SELECT comment_text FROM public.guest_rating_comments");
  await denied(approver,"SELECT public.apply_guest_rating_comment_disposition($1)",[id(991)]);
  await denied(executor,"SELECT public.approve_guest_rating_comment_notice($1,$2,1,$3)",[org,loc,id(992)]);
  const vectors=JSON.parse(await readFile(new URL("../../contracts/src/fixtures/guest-rating-canonical-199.json",import.meta.url),"utf8"));
  eq(vectors.length,199,"exact P1 oracle inventory");
  for(const vector of vectors) {
    if(vector.input!==null && typeof vector.input!=="string") {incompatible++;continue;}
    if (typeof vector.input === "string" && Array.from(vector.input).some(
      (scalar) => scalar.length === 1 && scalar.charCodeAt(0) >= 0xd800 &&
        scalar.charCodeAt(0) <= 0xdfff)) {
      incompatible++; // JS-only malformed UTF-16: pg text transport replaces it.
      continue;
    }
    let actual;
    try {
      const r=await row(migration,"SELECT rating_feedback_private.canonical_comment($1::text) value",[vector.input]);
      actual={ok:true,v:r.value};
    }catch {actual={ok:false};}
    eq(actual,vector.expected,"SQL canonical oracle parity");
    parity++;
  }
  async function guest(token,stars,comment,visit,legacy=false) {
    const sql=legacy
      ?"SELECT * FROM public.guest_rating_submit($1::text,$2::integer)"
      :"SELECT * FROM public.guest_rating_submit($1::text,$2::integer,$3::text,$4::uuid)";
    const args=legacy?[token,stars]:[token,stars,comment,visit];
    return row(runtime,sql,args);
  }
  await seedP2Fixture(migration);
  const tokenB="B".repeat(43), visitB=id(702);
  eq((await guest(tokenB,5,"مرحبا\r\nhello",visitB)).result_code,
    "FEEDBACK_UNAVAILABLE","pre-notice complete pair blocked");
  eq((await row(migration,"SELECT count(*)::int n FROM guest_ratings WHERE valet_session_id=$1",[visitB])).n,
    0,"no parent on notice failure");
  async function notice(version,caseId) {
    return (await row(approver,"SELECT public.approve_guest_rating_comment_notice($1,$2,$3,$4) result",
      [org,loc,version,caseId])).result;
  }
  eq(await notice(1,id(801)),"APPROVED","bilingual notice approved");
  eq(await notice(1,id(801)),"APPROVED","notice replay");
  const first=await guest(tokenB,5,"مرحبا\r\nhello",visitB);
  eq([first.result_code,first.rating,first.valet_session_id],["OK",5,visitB],
     "atomic feedback write");
  const exact=await guest(tokenB,5,"مرحبا\nhello",visitB);
  eq([exact.result_code,exact.rated_at.valueOf()],["OK",first.rated_at.valueOf()],
     "byte-canonical retry and original timestamp");
  eq((await guest(tokenB,5,"changed",visitB)).result_code,"CONFLICT","different comment");
  eq((await guest(tokenB,5,null,visitB)).result_code,"CONFLICT","null cannot erase text");
  eq((await guest(tokenB,5,null,null,true)).result_code,"CONFLICT","old2 cannot append");
  eq((await guest(tokenB,5,"wrong",id(703))).result_code,"INVALID_ACCESS","assert visit");
  const child=await row(migration,"SELECT comment_text,state,notice_version FROM guest_rating_comments WHERE valet_session_id=$1",[visitB]);
  eq(child,{comment_text:"مرحبا\nhello",state:"PRESENT",notice_version:1},"canonical row");
  const tokenA="A".repeat(43),visitA=id(701);
  const stars=await guest(tokenA,4,null,null,true);
  eq(stars.result_code,"OK","legacy first");
  eq((await guest(tokenA,4,null,null,true)).rated_at.valueOf(),
     stars.rated_at.valueOf(),"legacy exact replay");
  eq((await guest(tokenA,5,null,null,true)).result_code,"CONFLICT","legacy changed stars");
  eq((await guest(tokenA,4,"new",visitA)).result_code,"CONFLICT","cannot append later");
  async function approve(action,visit,caseId,approval) {
    const valid=new Date(Date.now()+3600000);
    return (await row(approver,"SELECT public.approve_guest_rating_comment_disposition($1,$2,$3,$4,$5,$6,$7) result",
      [approval,org,loc,visit,action,caseId,valid])).result;
  }
  async function apply(approval) {
    return (await row(executor,"SELECT public.apply_guest_rating_comment_disposition($1) result",[approval])).result;
  }
  const holdCase=id(821);
  eq(await approve("HOLD",visitB,holdCase,id(820)),"APPROVED","hold approval");
  eq(await apply(id(820)),"HELD","controlled hold");
  eq((await guest(tokenB,5,"مرحبا\nhello",visitB)).result_code,"CONFLICT","held retry");
  eq(await approve("ERASE",visitB,id(823),id(822)),"APPROVED","erase approval");
  eq(await apply(id(822)),"HELD_PENDING","erase while held");
  eq(await approve("RELEASE",visitB,holdCase,id(824)),"APPROVED","release approval");
  eq(await apply(id(824)),"ERASED","release clears pending erase");
  eq(await apply(id(824)),"ERASED","terminal receipt replay");
  eq((await guest(tokenB,5,"مرحبا\nhello",visitB)).result_code,"CONFLICT","no resurrection");
  eq((await guest(tokenB,5,null,null,true)).result_code,"CONFLICT","legacy erased denial");
  const erased=await row(migration,"SELECT comment_text,state,erased_at IS NOT NULL erased FROM guest_rating_comments WHERE valet_session_id=$1",[visitB]);
  eq(erased,{comment_text:null,state:"ERASED",erased:true},"terminal content cleared");
  const grants=await row(migration,"SELECT has_column_privilege('vaylet_rating_feedback_privacy_owner','public.guest_rating_comments','comment_text','SELECT') can_read,has_table_privilege('issue463_p7_runtime','public.guest_rating_comments','UPDATE') can_write");
  eq(grants,{can_read:false,can_write:false},"least privilege after erasure");
  console.log(JSON.stringify({result:"PASS",assertions,canonicalVectors:parity,
    unsupportedJsOnly:incompatible,scope:"P2 SQL: legacy/new4, notice, immutable pair, privacy HOLD/ERASE/RELEASE"}));
} catch(error) {
  console.error(JSON.stringify({result:"FAIL",assertions,canonicalVectors:parity,
    message:error.message,code:error.code}));
  process.exitCode=1;
} finally {
  for(const client of clients) await client.end().catch(()=>{});
}
