import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReaderCoverage } from "./issue300-w8-reader-coverage.mjs";
import { verifyPhaseSeal } from "./issue300-w8-phase-seal.mjs";
import { sha256OwnedFile } from "./issue300-w8-owner-root.mjs";
import { assertLeaseActive } from "./issue300-w8-target.mjs";
import { rosterDigest, verifyWriterCoverage, assertComparableWriters } from
  "./issue300-w8-writer-proof.mjs";

const endpoints=["search","busySlotSearch","timeline","detail"];
const digest=(data)=>createHash("sha256").update(data).digest("hex");

test("signed heavy lease cannot expire during any reader or writer phase",()=>{
  const now=Date.parse("2026-10-20T00:00:00Z");
  const manifest={lease:{owner:"W8",exclusive:true,
    expiresAt:new Date(now+630_000).toISOString()}};
  assert.doesNotThrow(()=>assertLeaseActive(manifest,630_000,now));
  assert.throws(()=>assertLeaseActive(manifest,640_000,now),
    /insufficient/);
  assert.throws(()=>assertLeaseActive(manifest,0,now+630_001),
    /expired/);
  assert.throws(()=>assertLeaseActive({lease:{...manifest.lease,
    exclusive:false}},0,now));
});

test("writer p95 from raw and both command classes defeats edited global p95",()=>{
  const started=Date.parse("2026-10-20T00:00:00Z");
  const ids=["writer-001","writer-002"];
  const roster=ids.map((clientId,i)=>({clientId,sessionId:String(i),
    command:i===0?"INCIDENT_REPORT":"KEY_SLOT_ASSIGN"}));
  const oracle={writerCohorts:{"2":{
    rosterDigest:rosterDigest(roster),clientIds:ids,
    commandMix:{INCIDENT_REPORT:1,KEY_SLOT_ASSIGN:1}}}};
  function report(incidentMs=50){
    const raw=[];
    for(let i=0;i<24;i++)for(const c of roster){
      raw.push({clientId:c.clientId,command:c.command,
        elapsedMs:c.command==="INCIDENT_REPORT"?incidentMs:100,
        sourceIds:["00000000-0000-4000-8000-000000000091",
          "00000000-0000-4000-8000-000000000092"],
        idempotencyVerified:c.command==="INCIDENT_REPORT",
        at:new Date(started+1000+i*25_000).toISOString()});
    }
    return {writerKind:"ACTUAL_OPERATIONAL_HTTP_OR_DOMAIN_COMMAND",
      elapsedMs:600_000,startedAt:new Date(started).toISOString(),
      finishedAt:new Date(started+600_000).toISOString(),
      writerClients:2,writerClientIds:ids,rosterDigest:rosterDigest(roster),
      failedCommands:0,deadlocks:0,lockTimeouts:0,
      raw,successfulCommands:raw.length,p95Ms:100,
      commandCounts:{INCIDENT_REPORT:24,KEY_SLOT_ASSIGN:24}};
  }
  const baseline=report();
  assert(verifyWriterCoverage(baseline,oracle,2));
  assert.throws(()=>verifyWriterCoverage({...baseline,p95Ms:1},oracle,2),
    /must match actual/);
  assert.throws(()=>assertComparableWriters(baseline,report(90),oracle,2),
    /INCIDENT_REPORT writer p95/);
  assert.equal(assertComparableWriters(baseline,report(55),oracle,2),true);
});

function readerRows(count){
  const start=Date.parse("2026-10-18T18:00:00Z");
  const raw=Object.fromEntries(endpoints.map((key)=>[key,[]]));
  for(let reader=0;reader<count;reader++)for(let n=0;n<=30;n++){
    const endpoint=endpoints[n%4];
    raw[endpoint].push({reader,epochMs:start+n*20_000,
      status:200,elapsedMs:10});
  }
  return {raw,start:new Date(start).toISOString(),
    finish:new Date(start+600_000).toISOString()};
}

test("declared 5 and 25 readers all stay active for full 600s",()=>{
  for(const count of [5,25]){
    const input=readerRows(count);
    assert.equal(assertReaderCoverage(input.raw,count,input.start,
      input.finish,endpoints,1).readers,count);
    const hidden=structuredClone(input.raw);
    for(const rows of Object.values(hidden))
      for(let i=rows.length-1;i>=0;i--)
        if(rows[i].reader===count-1) rows.splice(i,1);
    assert.throws(()=>assertReaderCoverage(hidden,count,input.start,
      input.finish,endpoints,1),/did not run/);
    const early=structuredClone(input.raw);
    for(const rows of Object.values(early))
      for(let i=rows.length-1;i>=0;i--)
        if(rows[i].reader===0 && rows[i].epochMs>
          Date.parse(input.start)+300_000) rows.splice(i,1);
    assert.throws(()=>assertReaderCoverage(early,count,input.start,
      input.finish,endpoints,1),/did not run|ended early/);
  }
});

test("reader rejects non-200, missing endpoint, abbreviated phase",()=>{
  const input=readerRows(5);
  const rejected=structuredClone(input.raw);
  rejected.search[0].status=500;
  assert.throws(()=>assertReaderCoverage(rejected,5,input.start,
    input.finish,endpoints,1),/non-200/);
  assert.throws(()=>assertReaderCoverage(input.raw,5,input.start,
    new Date(Date.parse(input.finish)-1).toISOString(),endpoints,1),
    /shorter/);
  const narrow=structuredClone(input.raw);
  // Explicitly reject a missing source path for every advertised reader.
  for(const rows of Object.values(narrow))
    for(let i=rows.length-1;i>=0;i--)
      if(rows[i].reader===0 && narrow.detail===rows) rows.splice(i,1);
  assert.throws(()=>assertReaderCoverage(narrow,5,input.start,
    input.finish,endpoints,1));
});

test("Owner-committed independent signature seals all five raw artifacts",(t)=>{
  const dir=mkdtempSync(join(tmpdir(),"w19-seal-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const signer=generateKeyPairSync("ed25519");
  const other=generateKeyPairSync("ed25519");
  const pub=join(dir,"independent.pem");
  writeFileSync(pub,signer.publicKey.export({type:"spki",format:"pem"}));
  const env={ISSUE300_W8_PHASE_SEAL_KEY:pub};
  const hashes={};
  for(const kind of ["baseline","live","readers","cold","plans"]){
    const file=join(dir,kind+".json");
    writeFileSync(file,JSON.stringify({kind,notMeasured:true}));
    hashes[kind]=sha256OwnedFile(file,dir);
    env[({baseline:"ISSUE300_W7_WRITER_BASELINE",
      live:"ISSUE300_W7_WRITER_LIVE",
      readers:"ISSUE300_W7_RESULTS_PATH",
      cold:"ISSUE300_W7_COLD_TRIALS",
      plans:"ISSUE300_W7_EXPLAIN_PLANS"})[kind]]=file;
  }
  const now=Date.now();
  const start=new Date(now-650_000).toISOString();
  const finish=new Date(now-20_000).toISOString();
  const m={candidateSha:"a".repeat(40),leaseId:"issue300-r2-w8-test-123456",
    targetTier:1_000_000,sourceFixtureHash:"b".repeat(64),
    resource:{dataPath:dir,containerId:"c".repeat(64),
      apiBundleSha256:"d".repeat(64)},
    phaseSealIssuerKeySha256:digest(signer.publicKey.export({
      type:"spki",format:"der"}))};
  const readerReport={mode:"normal",startedAt:start,finishedAt:finish};
  const writerReport={startedAt:start,finishedAt:finish};
  const seal={provenance:"INDEPENDENT_OWNER_SIGNED_W8_PHASE_V1",
    candidateSha:m.candidateSha,leaseId:m.leaseId,targetTier:m.targetTier,
    sourceFixtureHash:m.sourceFixtureHash,
    containerId:m.resource.containerId,
    apiBundleSha256:m.resource.apiBundleSha256,
    stage:"normal",readerStartedAt:start,readerFinishedAt:finish,
    writerStartedAt:start,writerFinishedAt:finish,
    signedAt:new Date(now-1000).toISOString(),artifactSha256:hashes};
  const file=join(dir,"seal.json");
  const signature=join(dir,"seal.sig");
  env.ISSUE300_W8_PHASE_SEAL_JSON=file;
  env.ISSUE300_W8_PHASE_SEAL_SIG=signature;
  const save=(payload,key=signer.privateKey)=>{
    const bytes=Buffer.from(JSON.stringify(payload));
    writeFileSync(file,bytes);
    writeFileSync(signature,sign(null,bytes,key));
  };
  save(seal);
  assert.equal(verifyPhaseSeal(m,readerReport,writerReport,env).signedAt,
    seal.signedAt);
  writeFileSync(env.ISSUE300_W7_WRITER_LIVE,"tampered");
  assert.throws(()=>verifyPhaseSeal(m,readerReport,writerReport,env),
    /Unsigned\/mutated/);
  writeFileSync(env.ISSUE300_W7_WRITER_LIVE,
    JSON.stringify({kind:"live",notMeasured:true}));
  save(seal,other.privateKey);
  assert.throws(()=>verifyPhaseSeal(m,readerReport,writerReport,env),
    /signature failed/);
  save({...seal,signedAt:new Date(now-700_000).toISOString()});
  assert.throws(()=>verifyPhaseSeal(m,readerReport,writerReport,env),
    /predates/);
});
