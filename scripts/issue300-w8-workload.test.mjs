import test from "node:test";
import assert from "node:assert/strict";
import { rosterDigest, assertWriterCohort, verifyWriterCoverage,
  assertComparableWriters } from "./issue300-w8-writer-proof.mjs";
import { assertRuntimeSample,assertRuntimeCheckpointWindow,
  assertRuntimePhaseCoverage } from "./issue300-w8-runtime-continuity.mjs";
import { assertNonemptyPlan } from "./issue300-w8-plans.mjs";

const session=(n)=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
const roster=[
  {clientId:"writer-001",sessionId:session(1),membershipId:session(10),
    organizationId:session(40),locationId:session(50),
    command:"INCIDENT_REPORT"},
  {clientId:"writer-002",sessionId:session(2),membershipId:session(11),
    organizationId:session(40),locationId:session(50),
    command:"KEY_SLOT_ASSIGN",keySlots:["K1","K2"]},
];
const id="00000000-0000-4000-8000-000000000021";
const oracle={writerCohorts:{"2":{
  rosterDigest:rosterDigest(roster),
  clientIds:["writer-001","writer-002"],
  commandMix:{INCIDENT_REPORT:1,KEY_SLOT_ASSIGN:1}}},
  expected:{search:{sessionId:session(1),source:"AUDIT",eventId:id},
    busySlotSearch:{sessionId:session(2),source:"KEY_CUSTODY",eventId:id}},
};

function writerReport(rosterInput=roster,mode="baseline",offset=0){
  const start=Date.parse("2026-10-18T18:00:00Z")+offset;
  const raw=[];
  for(let i=0;i<24;i++)for(const [j,c] of rosterInput.entries()){
    const first=100+i*4+j*2+(offset?1000:0);
    raw.push({clientId:c.clientId,command:c.command,
      elapsedMs:50,sourceIds:[session(first),session(first+1)],
      idempotencyVerified:c.command==="INCIDENT_REPORT",
      at:new Date(start+1000+i*25_000).toISOString()});
  }
  return {writerKind:"ACTUAL_OPERATIONAL_HTTP_OR_DOMAIN_COMMAND",
    mode,artifactId:session(offset?2000:1000),
    writerClients:rosterInput.length,writerClientIds:rosterInput.map((c)=>c.clientId),
    rosterDigest:rosterDigest(rosterInput),
    elapsedMs:600_000,startedAt:new Date(start).toISOString(),
    finishedAt:new Date(start+600_000).toISOString(),
    failedCommands:0,deadlocks:0,lockTimeouts:0,
    successfulCommands:raw.length,raw,p95Ms:50,
    commandCounts:{
      INCIDENT_REPORT:raw.filter((r)=>r.command==="INCIDENT_REPORT").length,
      KEY_SLOT_ASSIGN:raw.filter((r)=>r.command==="KEY_SLOT_ASSIGN").length},
  };
}

test("two real canonical cohorts require signed identical writer roster",()=>{
  assert.equal(assertWriterCohort(roster,oracle,2).rosterDigest,rosterDigest(roster));
  const baseline=writerReport();
  const live=writerReport(roster,"normal",700_000);
  assert.equal(verifyWriterCoverage(baseline,oracle,2).KEY_SLOT_ASSIGN.length,24);
  assert.equal(assertComparableWriters(baseline,live,oracle,2),true);
  assert.throws(()=>assertWriterCohort(roster.map((c)=>({
    ...c,command:"INCIDENT_REPORT"})),oracle,2));
  assert.throws(()=>assertWriterCohort([...roster].reverse(),{
    writerCohorts:{"2":{...oracle.writerCohorts["2"],
      rosterDigest:"0".repeat(64)}}},2));
  const swapped=writerReport(roster.map((c,i)=>({
    ...c,sessionId:session(i+30)})),"normal",700_000);
  assert.throws(()=>assertComparableWriters(baseline,swapped,oracle,2));
  const cheap=writerReport();
  cheap.raw=cheap.raw.filter((r)=>r.command==="INCIDENT_REPORT");
  cheap.successfulCommands=cheap.raw.length;
  cheap.commandCounts.KEY_SLOT_ASSIGN=0;
  assert.throws(()=>verifyWriterCoverage(cheap,oracle,2));
  const stopped=writerReport();
  stopped.raw=stopped.raw.filter((r)=>r.clientId==="writer-001" ||
    Date.parse(r.at)<Date.parse(stopped.startedAt)+30_000);
  stopped.successfulCommands=stopped.raw.length;
  stopped.commandCounts.KEY_SLOT_ASSIGN=stopped.raw.filter((r)=>
    r.command==="KEY_SLOT_ASSIGN").length;
  assert.throws(()=>verifyWriterCoverage(stopped,oracle,2));
  const slower=writerReport(roster,"normal",700_000);
  slower.p95Ms=180;
  assert.throws(()=>assertComparableWriters(baseline,slower,oracle,2));
});

test("busy slot EXPLAIN must have positive signed slot witness",()=>{
  const good=[{sessionId:session(2),matchingRecordCount:3,
    reasons:[{source:"KEY_CUSTODY",eventId:id,matchedBy:"KEY_SLOT"}]}];
  assertNonemptyPlan({Plan:{"Actual Rows":2}},good,"busySlotSearch",
    oracle.expected);
  assert.throws(()=>assertNonemptyPlan({Plan:{"Actual Rows":2}},
    [{sessionId:session(2),matchingRecordCount:3,
      reasons:[{source:"KEY_CUSTODY",eventId:id,matchedBy:"WINDOW"}]}],
    "busySlotSearch",oracle.expected));
  assert.throws(()=>assertNonemptyPlan({Plan:{"Actual Rows":0}},good,
    "busySlotSearch",oracle.expected));
});

test("API runtime proof is exact PID/bundle/port and is time bounded",()=>{
  const now=Date.now();
  const start=new Date(now-60_000).toISOString();
  const candidateSha="a".repeat(40),leaseId="issue300-r2-w8-new-lease-abc";
  const containerId="b".repeat(64),bundle="c".repeat(64);
  const vmUuid="00000000-0000-4000-8000-000000000004";
  const m={candidateSha,leaseId,targetTier:100000,
    sourceFixtureHash:"f".repeat(64),
    resource:{containerId,vmUuid,apiPort:32101,apiBundleSha256:bundle}};
  const signed={apiRuntime:{apiPid:812,processStartedAt:start}};
  const sample={kind:"OWNED_GUEST_API_PROCESS_SAMPLE",
    provenance:"GUEST_PROC_EXEC_HASH_AND_LISTENER",candidateSha,leaseId,
    targetTier:100000,sourceFixtureHash:"f".repeat(64),
    containerId,vmUuid,port:32101,apiBundleSha256:bundle,
    apiPid:812,processStartedAt:start,processAlive:true,
    listenerProbed:true,bundleReadFromRunningProcess:true,
    sequence:5,sampledAt:new Date(now-1000).toISOString()};
  assert(Number.isFinite(assertRuntimeSample(sample,m,signed,now)));
  assert.throws(()=>assertRuntimeSample({...sample,apiPid:813},m,signed,now));
  assert.throws(()=>assertRuntimeSample({...sample,
    apiBundleSha256:"d".repeat(64)},m,signed,now));
  assert.throws(()=>assertRuntimeSample({...sample,
    sampledAt:new Date(now-70_000).toISOString()},m,signed,now));
});

test("signed API process checkpoints must cover every 45s window of full 600s",()=>{
  const t=Date.parse("2026-10-18T18:00:00Z");
  assert.doesNotThrow(()=>assertRuntimeCheckpointWindow(t,t+30_000));
  assert.throws(()=>assertRuntimeCheckpointWindow(t,t+60_000));
  const start=new Date(t).toISOString(),end=new Date(t+600_000).toISOString();
  assert.doesNotThrow(()=>assertRuntimePhaseCoverage(t-1000,t+598_000,
    start,end,21));
  assert.throws(()=>assertRuntimePhaseCoverage(t-60_000,t+598_000,
    start,end,21));
  assert.throws(()=>assertRuntimePhaseCoverage(t-1000,t+550_000,
    start,end,21));
  assert.throws(()=>assertRuntimePhaseCoverage(t-1000,t+598_000,
    start,end,19));
});
