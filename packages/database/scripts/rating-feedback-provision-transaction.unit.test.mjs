import assert from "node:assert/strict";
import {test} from "node:test";

import {
  runRatingFeedbackProvisionTransaction,
} from "./rating-feedback-provision-transaction.mjs";
import {feedbackRoles} from "./rating-feedback-stage-contract.mjs";

const roles={migrationRole:"p0463_migrator",runtimeRole:"p0463_runtime"};
const boundary={phase:"PROTECTED",backend_pid:416,full_xid:"722"};
function harness({before="PREPARE",failGrant=false}={}){
  const queries=[];
  const checks=[];
  let stage=before;
  const client={async query(sql,params=[]){
    queries.push({sql,params});
    if(failGrant&&sql.startsWith("GRANT EXECUTE"))
      throw Error("synthetic failed grant");
    return {rows:[],rowCount:0};
  }};
  const dependencies={
    async lockBoundary(){queries.push({sql:"OWNER_BOUNDARY_FOR_UPDATE"});return boundary;},
    async assertSameTransaction(){queries.push({sql:"SAME_XID"});},
    async readStage(){return stage;},
    async verifyAcl(_,options){checks.push(options.stage);},
    async formatted(_,sql,args){
      if(failGrant&&sql.startsWith("GRANT EXECUTE"))
        throw Error("synthetic failed grant");
      queries.push({sql,args});
      if(sql.startsWith("GRANT EXECUTE"))stage=stage==="PREPARE"?
        "P2_TEST":"P5_TEST";
    },
  };
  return {client,checks,queries,dependencies};
}

test("P2_TEST grants only exact functions, under existing Option C XID",async()=>{
  const h=harness();
  const result=await runRatingFeedbackProvisionTransaction(h.client,{
    ...roles,stage:"P2_TEST",installed:"P2",disposable:true,
    approverPassword:"synthetic-a",executorPassword:"synthetic-e",
  },h.dependencies);
  assert.deepEqual(result,{phase:"PROTECTED",stage:"P2_TEST",replayed:false});
  assert.deepEqual(h.checks,["PREPARE","P2_TEST"]);
  assert.equal(h.queries[0].sql,"BEGIN");
  assert.equal(h.queries.at(-1).sql,"COMMIT");
  assert.equal(h.queries.filter(x=>x.sql.includes("SET LOCAL ROLE")).length,2);
  assert.equal(h.queries.some(x=>x.sql.includes("PUBLIC")),false);
  assert.equal(h.queries.some(x=>x.sql.includes("rating_feedback_private")),false);
  assert.equal(h.queries.filter(x=>x.sql.includes("ALTER ROLE")).length,2);
});

test("P5_TEST adds only F projection and S nested EXECUTE",async()=>{
  const h=harness({before:"P2_TEST"});
  const result=await runRatingFeedbackProvisionTransaction(h.client,{
    ...roles,stage:"P5_TEST",installed:"P5",disposable:true,
  },h.dependencies);
  assert.equal(result.replayed,false);
  assert.deepEqual(h.checks,["P2_TEST","P5_TEST"]);
  assert.equal(h.queries.filter(x=>x.sql.includes("SET LOCAL ROLE")).length,2);
  assert.equal(h.queries.some(x=>x.args?.includes(feedbackRoles.reader)),true);
  assert.equal(h.queries.some(x=>x.sql.includes("ALTER ROLE")),false);
  assert.equal(h.queries.at(-1).sql,"COMMIT");
});

test("exact stage replay verifies and never mutates grants",async()=>{
  const h=harness({before:"P5_TEST"});
  const result=await runRatingFeedbackProvisionTransaction(h.client,{
    ...roles,stage:"P5_TEST",installed:"P5",disposable:true,
  },h.dependencies);
  assert.equal(result.replayed,true);
  assert.deepEqual(h.checks,["P5_TEST"]);
  assert.equal(h.queries.some(x=>x.sql.includes("GRANT")),false);
});

test("unsafe state, failed grant or missing approval rolls back",async()=>{
  const h=harness({before:"PREPARE"});
  await assert.rejects(runRatingFeedbackProvisionTransaction(h.client,{
    ...roles,stage:"P5_TEST",installed:"P5",disposable:true,
  },h.dependencies),/skipped stage/);
  assert.equal(h.queries.at(-1).sql,"ROLLBACK");
  const failed=harness({failGrant:true});
  await assert.rejects(runRatingFeedbackProvisionTransaction(failed.client,{
    ...roles,stage:"P2_TEST",installed:"P2",disposable:true,
    approverPassword:"a",executorPassword:"b",
  },failed.dependencies),/synthetic failed grant/);
  assert.equal(failed.queries.at(-1).sql,"ROLLBACK");
  assert.equal(failed.queries.some(x=>x.sql==="COMMIT"),false);
});
