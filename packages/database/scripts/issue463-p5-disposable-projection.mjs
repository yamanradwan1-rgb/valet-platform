// Bounded P5 projection / legacy numeric parity on owned synthetic PG17 only.
import assert from "node:assert/strict";
import pg from "pg";
import { assertP7SqlTarget } from "../../../apps/api/tools/issue463-browser-proof-sql-target.mjs";
const target=await assertP7SqlTarget();
const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const m=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
const r=new pg.Client({connectionString:process.env.DATABASE_URL});
let assertions=0;
function eq(actual,expected,label){
  assert.deepEqual(actual,expected,label);
  assertions++;
}
try {
  await m.connect();await r.connect();
  const identity=(await m.query(
    "SELECT current_database() db,current_user usr,system_identifier::text system FROM pg_control_system()"
  )).rows[0];
  eq([identity.db,identity.usr,identity.system],[
    target.database,"issue463_p7_migrator",target.system,
  ],"disposable target");
  const day=(await r.query("SELECT CURRENT_DATE AS today")).rows[0].today;
  const scope=id(101), member=id(401);
  const params=[
    id(501),id(301),"vsa1."+"A".repeat(43),"2026-01-01T00:00:00Z",
    member,scope,null,day,day,
  ];
  const next=(await r.query(
    "SELECT public.management_rating_feedback_projection($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::uuid,$6::uuid,$7::uuid,$8::date,$9::date) AS value",
    params,
  )).rows[0].value;
  const previous=(await r.query(
    "SELECT public.management_rating_analytics_projection($1::uuid,$2::uuid,$3::date,$4::date) AS value",
    [scope,null,day,day],
  )).rows[0].value;
  eq(Array.isArray(next.recentRatings),true,"expanded bounded recent rows");
  eq(next.recentRatings.length<=4,true,"at most four rows");
  eq(next.recentRatings.every(x=>typeof x.comment==="string"||x.comment===null),
    true,"every recent row has strict nullable comment");
  const withoutText={
    ...next,recentRatings:next.recentRatings.map(({comment,...item})=>item),
  };
  eq(withoutText,previous,"default numeric contract parity, no extra identity");
  let invalidBearerCode;
  try {
    await r.query(
      "SELECT public.management_rating_feedback_projection($1::uuid,$2::uuid,$3::text,$4::timestamptz,$5::uuid,$6::uuid,$7::uuid,$8::date,$9::date)",
      [...params.slice(0,2),"incorrect-bearer",...params.slice(3)],
    );
  }catch(error){invalidBearerCode=error.code;}
  eq(invalidBearerCode,"42501","direct runtime forged bearer rejected");
  let rawCode;
  try {await r.query("SELECT comment_text FROM guest_rating_comments LIMIT 1");}
  catch(error){rawCode=error.code;}
  eq(rawCode,"42501","runtime direct raw comment access denied");
  console.log(JSON.stringify({result:"PASS",assertions,
    recentCount:next.recentRatings.length,
    scope:"real runtime current bearer/CA and original numeric SQL parity"}));
}catch(error){
  console.error(JSON.stringify({result:"FAIL",assertions,message:error.message,code:error.code}));
  process.exitCode=1;
}finally{
  await r.end().catch(()=>{});await m.end().catch(()=>{});
}
